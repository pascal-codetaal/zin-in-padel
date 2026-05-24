# Zin in Padel — Domain Context

## Glossary

### User
Someone who interacts with the WhatsApp bot. Identified by `waId` (WhatsApp ID).
Has opt-in state, onboarding state, and an `activeFlow`.

### Player
A co-player (teammate or opponent) identified by their **mobile phone number**.
A Player may or may not also be a User. The phone string is the unique key and
the join with `User.phone`. The User ↔ Player link is **derived** by phone
match — not stored explicitly. Format is whatever the user provides; no
canonical form is enforced (POC scope).

Fields: `{ phone, name }`. Phone is unique across all Players.

### Favorite Player
A Player that a User has marked as a co-player they regularly play with.
Stored as `User.favoritePlayerPhones: string[]` (each must exist as a
`Player` record). Multiple Users may share the same favorite Player
(deduplicated globally in `players[]`).

### Active Flow
A User's currently-running conversational subroutine. `User.activeFlow` is
either `null` (no flow — only hardcoded commands respond) or a flow name
(currently only `"favorites"`). When non-null, inbound messages route to
the Mastra agent.

### Favorites Flow
The agent-driven conversation that collects a User's favorite Players.
Entered automatically after `JA` opt-in, and re-entered manually via the
`MAATJES` command. The agent decides when the User is "klaar" and clears
`activeFlow`.

### Match
A planned padel session organised by one User. Has a club, scheduled time,
duration, format (mixed / men_only / women_only), and `totalSlots` (always 4
for padel). Carries the cascade configuration (see Cascade below) plus
runtime cascade state (`currentCascadePhase`, `nextCascadeAt`).

### Match Invite
An ask sent to one specific Player to fill one open slot of one Match.
Stored as `MatchInvitedPlayer` rows — the **single source of truth** for
who was invited, in which cascade phase, when sent, and how they responded.

Fields: `token` (opaque base62, 22 chars, globally unique — drives the
accept/decline deep link), `status` (`pending` | `accepted` | `declined` |
`expired`), `cascadePhase` (1 | 2 | 3), `sentAt`, `respondedAt`.

Distinct from `MatchConfirmedSlot` — a name already on the court when the
Match was created (e.g. from a Playtomic ✅ line, or the organiser
themselves). Confirmed slots bypass the invite/accept flow entirely.

A Match Invite is only deliverable to opted-in Users. Non-User favourites
are silently skipped in cascade and surfaced to the organiser in the match
detail UI ("Tom kreeg geen uitnodiging — niet ingeschreven bij PadelMatch").

Not to be confused with the wa.me bot-join link in
`app/lib/invite.server.ts` — that recruits a User to the bot, not to a Match.
Will be renamed (e.g. `bot-join-link.server.ts`) to free up the "invite"
namespace.

### Cascade
The phased fan-out of Match Invites driven by a hybrid scheduler
(Supabase Cron → Vercel API → pgmq → Twilio). See ADR-0003.

- **Phase 1 — Friends.** Always fires at t=0. Audience: organiser's
  `invitedFriendRefs` ∩ opted-in Users.
- **Phase 2 — Level.** Fires at `t + fallbackLevelDelayMinutes` if
  `fallbackToLevelRange=true` and Match not yet full. Audience: opted-in
  Users where `level ∈ [fallbackLevelMin, fallbackLevelMax]`.
- **Phase 3 — Everyone.** Fires at `t + fallbackEveryoneDelayMinutes` if
  `fallbackToEveryone=true` and Match still not full. Audience: all
  opted-in Users (no level filter).

A phase only fires if the Match isn't full yet. A phase that finds an
empty audience after exclusions is a no-op (cascade continues to next
phase per schedule).

#### Cascade exclusions (phases 2 + 3 only)
- `matchPreference = 'friends_only'`
- Gender does not match Match `format` (men_only / women_only)
- Has an accepted slot in another Match overlapping this time window
- `preferredClubIds` does not contain this Match's `clubId`
- Is the organiser
- Already invited in an earlier phase of this Match
- `optedIn = false`

### Accept / Decline
An invited Player's response to a Match Invite, driven by a per-invite
deep link (`/i/{token}` for accept, `/i/{token}/nee` for decline) — never
by a WhatsApp text reply.

- **Accept** requires a confirmation tap on the landing page. On commit:
  `status='accepted'`, `respondedAt=now()`, WhatsApp confirmation sent
  back to the invitee.
- **Decline** is instant on link tap, with an undo ("Toch meedoen?") if
  slots are still open.
- **First-come-first-served**: filling is enforced transactionally at
  accept time with a row-level lock on the Match. When the Match is full
  (`confirmedSlotNames.length + accepted count >= totalSlots`), further
  accept taps render "Sorry, deze match is helaas vol".
- **Tokens stay live until `match.startsAt`** regardless of fill status.
  After `startsAt`, accept taps render "Deze match is al begonnen."
- **Idempotent**: second tap is a no-op with a friendly message.
- **Cancelled match**: pending tokens become invalid; pgmq queue entries
  for unsent invites are drained.

### Message
An inbound or outbound WhatsApp message. Stored in a single `messages[]`
collection with `direction: 'in' | 'out'`. Used both for audit and for
reconstructing conversation history for the agent.

## Commands (hardcoded, bypass agent)

| Command | Effect |
|---------|--------|
| `JA`       | Opt-in, then enter favorites flow |
| `STOP`     | Opt-out, clear `activeFlow` |
| `HELP`     | Show command list |
| `MAATJES`  | Re-enter favorites flow |

## Storage (Supabase Postgres via Prisma)

App data + club catalog live in Supabase Postgres (`DATABASE_URL`). Schema is in
`prisma/schema.prisma`; relational tables for users, players, favorites,
preferred clubs, matches (with `MatchInvitedPlayer` as the single source
of truth for invite lifecycle, and `confirmedSlotNames` for bypass slots),
messages, games, clubs, and club Playtomic aliases.

- `app/lib/prisma.server.ts` exports a singleton Prisma client (HMR-safe).
- `app/lib/db.server.ts` and `app/lib/clubs.server.ts` wrap Prisma — call
  sites still operate on the domain types from `~/types/domain`.
- DB is the source of truth. Schema changes via `npx prisma migrate dev`.

## Phone numbers

- **No format validation.** Phone is stored as the user typed it and is the
  unique key for `Player`. Two users entering the same number in different
  shapes (e.g. `0612345678` vs `+31612345678`) currently produce two distinct
  Players. Revisit when leaving POC scope — see ADR 0001.

## Notes

- Legacy SQLite at `data/app.db` can be copied once via `pnpm db:copy-sqlite`. See README.
- Agent conversation memory lives in Mastra Memory + Postgres (same Supabase
  as the app, via `DATABASE_URL`), keyed by `thread = user.id` under a single
  shared `resource = "padel-assistant"`. The shared resource lets Mastra
  Studio show every user's chat in one place, regardless of which environment
  produced it. See `app/lib/mastra/memory.server.ts` and
  `app/lib/whatsapp-bot.server.ts`. The legacy LibSQL file at
  `data/mastra-memory.db` is no longer read — kept around as a backup. One-time
  migration: `pnpm tsx scripts/migrate-mastra-memory-to-pg.ts`.
