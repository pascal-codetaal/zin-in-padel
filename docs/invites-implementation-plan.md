# Implementation plan — Match Invites system

Companion to ADR-0002, ADR-0003, ADR-0004. Sequenced so each step is
verifiable in isolation and PR-able independently.

> **Historical.** This plan was executed; the match/invite domain logic
> still applies. The invite-send/scheduler layer it describes (`pgmq` +
> Supabase `pg_cron`, Phases E–F) was later replaced by BullMQ + Redis with
> a dedicated worker — see ADR-0005 and `docs/invite-queue-system.md` for
> the current system. Read the Phase E/F sections below as the original
> plan, not the present state.

## Phase A — schema + rename (foundation)

### A1. Rename `invite.server.ts` → `bot-onboarding.server.ts`
- Move file, update all imports (`buildWhatsAppInviteUrl`,
  `invitePrefillMessage`, etc.). Consider also renaming the exports
  (e.g. `buildBotOnboardingUrl`) — search-and-replace.
- **Verify**: `pnpm tsc --noEmit` green; bot opt-in flow still works in
  the dev simulator.

### A2. Prisma migration: collapse accepted into invited (ADR-0002)
- Add `InviteStatus` enum, new columns on `MatchInvitedPlayer`
  (`token`, `status`, `cascadePhase`, `sentAt`, `respondedAt`,
  `sendAttempts`, `sendError`).
- Add new columns on `Match` (`currentCascadePhase`, `nextCascadeAt`).
- Backfill SQL: derive `status='accepted'` from rows in
  `MatchAcceptedPlayer`; default `cascadePhase=1`, `sentAt=invitedAt`;
  generate `token` via SQL (`encode(gen_random_bytes(16), 'base64')`
  trimmed to 22 chars, then idempotently de-duped if needed).
- Drop `MatchAcceptedPlayer` table and `Match.acceptedPlayerRefs` column.
- **Verify**: `pnpm prisma migrate dev`; existing matches still load in
  the organiser list view; manual: open one match in the dev simulator
  and confirm previously-accepted players still show as accepted.

### A3. Update domain types + helpers
- `app/types/domain.ts`: add `InviteStatus`, extend `MatchInvitedPlayer`
  type, drop `acceptedPlayerRefs` from `Match`.
- New helper `acceptedPlayerRefsOf(match)` and update `isMatchFull`,
  `openSlotsOf` to use it.
- **Verify**: `pnpm tsc --noEmit`; existing tests pass.

## Phase B — pure cascade core (ADR-0004)

### B1. `app/lib/cascade/decide.ts` + tests
- `decideCascadePhase(match, now): CascadeDecision`.
- Table-driven tests covering: nothing-to-do, fire-phase-2,
  fire-phase-3, match-full, exhausted, past-startsAt, cancelled.
- **Verify**: `pnpm test cascade/decide`.

### B2. `app/lib/cascade/audience.ts` + tests
- `buildPhaseAudience(...)` applying all 7 exclusions for phase 2/3 and
  the friends-only filter for phase 1.
- Tests for each exclusion in isolation + combined.
- **Verify**: `pnpm test cascade/audience`.

### B3. `app/lib/cascade/format.ts` + tests
- `formatInviteMessage(...)` returns the three Dutch templates with
  ✅ Ja / ❌ Nee dual links.
- Snapshot tests for each phase.
- **Verify**: `pnpm test cascade/format`.

### B4. `app/lib/cascade/token.ts` + tests
- `generateInviteToken(): string` (22-char base62, crypto-random).
- Tests: length, alphabet, distribution sanity (1000 tokens distinct).
- **Verify**: `pnpm test cascade/token`.

## Phase C — adapter + manual tick (no Twilio yet, no cron yet)

### C1. `app/lib/cascade/runner.server.ts`
- `runCascadeTick(now): Promise<TickTrace>` — loads due matches, calls
  `decideCascadePhase`, builds audiences, inserts
  `MatchInvitedPlayer` rows, returns a trace.
- Does **not** call Twilio yet — sets `sentAt=null` and just inserts rows.
- **Verify**: write an integration test against the real local Postgres
  that fires a phase-2 transition and asserts the rows appear with
  correct fields.

### C2. `/dev/cron-tick` route
- `POST /dev/cron-tick?which=cascade` → calls `runCascadeTick(new Date())`
  and returns the trace as JSON.
- Guarded by `process.env.NODE_ENV !== 'production'`.
- Add a "Tick cascade" button to the dev simulator.
- **Verify**: in the dev simulator, create a match with phase-2 at
  `t+1min`, advance time by editing `nextCascadeAt` in the DB, click the
  button, see invited rows appear.

### C3. Phase 1 (friends) wired at match creation
- When `finalize-match` tool creates a Match, immediately insert
  phase-1 `MatchInvitedPlayer` rows for opted-in favourites, with
  `status='pending'`, `cascadePhase=1`, generated tokens, `sentAt=null`.
- Set `Match.currentCascadePhase=1`, compute `Match.nextCascadeAt` from
  the cascade config (or NULL if no fallbacks).
- Non-User favourites: skipped from invite rows; surface in match detail.
- **Verify**: create a match via dev simulator, inspect DB, confirm rows.

## Phase D — accept / decline web flow

### D1. Routes `/i/$token._index.tsx` (accept) and `/i/$token.nee.tsx`
- **Accept loader**: validate token → branch on (status, isFull,
  startsAt vs now, match cancelled) → render appropriate page state.
- **Accept action**: transactional `UPDATE` with `FOR UPDATE` on Match,
  check fill, flip `status='accepted'`, `respondedAt=now()`. Enqueue
  WhatsApp confirmation if invitee `optedIn=true`.
- **Decline action**: instant; flip `status='declined'`, `respondedAt=now()`.
- Landing pages: greet by first name; accept shows match details + green
  "Bevestigen" button + first names of already-accepted players; decline
  shows thanks + "Toch meedoen?" if slots open.
- **Verify**: unit test the loader branches with fixtures; integration
  test the action's FCFS lock by firing two simultaneous accepts (last
  slot) and asserting only one wins.

### D2. Confirmation WhatsApp on accept
- New template: "Je bent ingeschreven voor {match} bij {club} op {datum}
  om {tijd} 🎾". Send via Twilio (or mock).
- Skip if invitee `optedIn=false`.
- **Verify**: integration test asserts Twilio mock received the message
  with correct body.

## Phase E — Twilio send path (queue worker)

### E0. Mock send via dev simulator (no Twilio, no pgmq)
- Goal: end-to-end invite flow visible in local simulator before any
  Twilio/pgmq wiring. Receiver sees the invite as a Message in their
  WhatsApp inbox, can tap the `/i/{token}` / `/i/{token}/nee` links.
- Add `TWILIO_MOCK=true` env flag (default in dev, off in prod).
- Create thin `sendInviteMessage(invite, match, organiser, recipient)`
  in `app/lib/twilio.server.ts` that, when `TWILIO_MOCK=true`:
  - Renders body via existing `formatInviteMessage()` (Phase B3).
  - Inserts a `Message` row into recipient's inbox (direction=inbound
    from bot, body=rendered text + clickable links).
  - Sets `MatchInvitedPlayer.sentAt = now()` synchronously.
  - Returns `{ ok: true, messageId: <db-id> }`.
- Wire call sites:
  - `finalizeMatchDraft` (Phase C3): after phase-1 rows exist, loop
    over them and call `sendInviteMessage` synchronously.
  - `runCascadeTick` (Phase C1b): after inserting phase-2/3 rows in
    `applyPlan`, loop and call `sendInviteMessage` synchronously.
- Simulator UI: existing message list automatically shows the mock
  invites because they're real `Message` rows. No extra UI needed.
- **Verify**: dev simulator script — create match as User A, switch to
  User B (invited friend), see invite message in B's inbox with clickable
  accept/decline links; tap accept → Phase D action runs → match fills.
- **Out of scope here**: pgmq, retries, dead-letter, real Twilio. All
  deferred to E1–E3. E0 is purely the local-dev send path.

### E1. pgmq queue + migration
- Migration: enable `pg_cron`, `pgmq`, `pg_net` extensions; create queue
  `invite-sends`.
- Reference patterns from the Supabase pgmq programmatic-enable thread
  for local-dev wrapper functions if needed.
- **Verify**: `supabase start` succeeds, queue exists, `pgmq.send`
  works from a `psql` shell.

### E2. Enqueue from cascade runner
- In `runCascadeTick`, after inserting `MatchInvitedPlayer` rows, enqueue
  one pgmq message per row: `{ inviteId, matchId, phase }`.
- **Verify**: trace shows enqueued ids; `pgmq.read` returns messages.

### E3. `/api/cron/send-tick` handler
- Auth via shared secret header.
- `pgmq.read('invite-sends', vt=60, qty=25)`.
- For each: load invite + match + invitee + organiser, render template,
  call Twilio (or mock).
- On success: `sentAt=now()`, `pgmq.delete`.
- On failure: `sendAttempts++`. If `≥ 3`: `pgmq.archive`,
  `status='expired'`, `sendError=<msg>`.
- **Verify**: integration test enqueues 3 invites, runs the handler,
  asserts Twilio mock received 3 messages and rows have `sentAt`.

### E4. `/dev/cron-tick?which=send` button in dev simulator
- Same pattern as C2. Local dev does not depend on cron.
- **Verify**: end-to-end manual test: create match → tick cascade →
  tick send → see Twilio mock log → tap accept link → match fills.

## Phase F — production cron wiring

### F1. Supabase Cron rows (via migration)
- Migration creates two cron rows using `cron.schedule()`:
  - `cascade-tick` every `* * * * *` → `pg_net` POST to
    `${VERCEL_URL}/api/cron/cascade-tick` with `Authorization` header.
  - `send-tick` every `*/30 * * * * *` (6-field syntax) → `pg_net` POST
    to `/api/cron/send-tick`.
- Env: `VERCEL_URL`, `CRON_SECRET` available to migration (via
  `vault` or migration-time `SET`).
- **Verify**: in Supabase dashboard, see two jobs in `cron.job`; trigger
  manually via `cron.schedule_async` and confirm Vercel logs receive.

### F2. Cron secret check in handlers
- `cascade-tick` and `send-tick` reject without correct
  `Authorization: Bearer ${CRON_SECRET}` header.
- **Verify**: curl without header → 401; with header → 200.

## Phase G — organiser controls + notifications

### G1. Organiser WhatsApp notifications (3 types)
- On accept: "✅ {name} doet mee — nog {n} plekken vrij".
- On match-full transition: "🎉 Match is vol! {names}".
- On cascade exhausted with open slots: "Geen reacties meer …".
- Wire from the accept action (G1a) and the cascade tick (G1b).
- **Verify**: manual end-to-end in dev simulator.

### G2. Match detail page updates
- Show invites table: name, phase, status (✅/⏳/❌), sentAt, phone (for
  accepted only).
- Show non-User favourites that were skipped.
- Show countdown to next cascade phase if `nextCascadeAt` set.
- **Verify**: visual check.

### G3. Manual controls
- **Skip-ahead phase**: button "Verstuur niveau-uitnodigingen nu" /
  "Verstuur iedereen nu" → action sets `Match.nextCascadeAt = now()`,
  triggers a manual tick.
- **Remove accepted player**: button per accepted row → action sets
  `status='expired'`, `respondedAt=now()`, sends WhatsApp to removed
  player, may resume cascade (re-evaluate `nextCascadeAt`).
- **Cancel match (enhanced)**: also drains pgmq for that match
  (`pgmq.archive` matching messages), marks pending invites as expired,
  sends cancellation WhatsApp to all accepted + pending.
- **Verify**: each control's happy-path manually in dev simulator.

## Phase H — agent integration

### H1. Update agent system prompt
- No change to invite-cascade conversation flow (already always invites
  all favourites, always presents A/B/C cascade options).
- Add a brief explainer in the post-finalize summary: "Ik stuur
  uitnodigingen via WhatsApp naar je maatjes. Je krijgt bericht zodra
  ze reageren."
- **Verify**: run the agent through a match creation, read the response.

## Verification gates summary

| Gate | What | Where |
|------|------|-------|
| Schema migration safe | Existing matches still render correctly | A2 |
| Pure cascade correct | All edge cases unit-tested | B1–B4 |
| FCFS race-safe | Two concurrent accepts on last slot — one wins | D1 |
| End-to-end dev loop | Create → tick cascade → tick send → Twilio mock → accept → match fills | E4 |
| Production cron wired | Supabase cron rows hit Vercel handlers | F1–F2 |
| Cancel drains queue | Cancel mid-cascade removes pending sends | G3 |

## Out of scope (deferred)

- Quiet hours / frequency caps (see Q14 — deferred until cascade
  actually causes complaints).
- "Match is full — here's an alternative match" CTA on the rejected
  accept page.
- Edge-Functions-based send loop (revisit if Vercel timeouts bottleneck).
- Re-invite a declined player (declined is declined).
- Edit-match-after-invites-sent.

## Risk register

| Risk | Mitigation |
|------|------------|
| pg_cron local-dev quirks | Inner loop uses manual `/dev/cron-tick` |
| Twilio rate limits | pgmq batch size 25, 30s tick = max 50 msg/min |
| Accidental WhatsApp spam | `TWILIO_MOCK=true` enforced in non-prod env |
| Token leakage | Tokens are per-invite; one leaked token = one invite slot |
| Cron secret leakage | Rotate via Supabase Vault; handler re-checks each request |
| Migration backfill performance | Tested locally on prod-sized backup before deploy |
