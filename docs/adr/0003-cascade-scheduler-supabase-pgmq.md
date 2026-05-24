# 0003 — Cascade scheduler: hybrid Supabase Cron + Vercel API + pgmq

## Status
Accepted (2026-05-24).

## Context
The cascade system needs:
- Phase 2 to fire `fallbackLevelDelayMinutes` after Match creation if not full.
- Phase 3 to fire `fallbackEveryoneDelayMinutes` after Match creation if not full.
- Per-invite WhatsApp sends through Twilio with retries and dead-lettering.
- Cancellation must be able to drop pending sends mid-flight.
- No invite is sent past the Match's `startsAt`.
- Survives the app-server going down (Vercel cold starts, deploys).

Pure in-process timers (`setTimeout`) lose state on restart. Vercel Cron is
out of scope for this product — we explicitly migrated from SQLite to
Supabase to leverage Supabase-native primitives.

## Decision

### Hybrid architecture

```
┌─────────────────┐     every 1m      ┌──────────────────────┐
│ Supabase Cron A │──────────────────▶│ /api/cron/cascade-   │
│                 │   pg_net → HTTPS  │ tick (Vercel)         │
└─────────────────┘                   └──────────┬───────────┘
                                                 │ pure function
                                                 │ decideCascadePhase
                                                 ▼
                                      ┌──────────────────────┐
                                      │ Postgres: insert      │
                                      │ MatchInvitedPlayer    │
                                      │ rows; enqueue pgmq    │
                                      │ "send-invite" jobs    │
                                      └──────────────────────┘

┌─────────────────┐     every 30s     ┌──────────────────────┐
│ Supabase Cron B │──────────────────▶│ /api/cron/send-tick   │
│                 │   pg_net → HTTPS  │ (Vercel)              │
└─────────────────┘                   └──────────┬───────────┘
                                                 │ pop pgmq batch
                                                 │ → Twilio
                                                 ▼
                                      ┌──────────────────────┐
                                      │ Twilio API            │
                                      └──────────────────────┘
```

### Why this split

- **Cron is dumb timing.** It exists only to wake an HTTP endpoint. All
  business logic lives in Vercel (TypeScript, testable).
- **State lives on the `Match` row** (`currentCascadePhase`, `nextCascadeAt`)
  rather than in pg_cron jobs. We don't schedule a job per match; we have
  two standing crons that scan.
- **pgmq for sends** decouples "decide who to invite" from "actually call
  Twilio". Retries, visibility timeouts, and dead-lettering come for free
  from pgmq.
- **Two crons, not one**: phase decisions are cheap (1/min); Twilio sends
  need higher cadence (30s) to feel responsive to invitees tapping accept.

### Cron A — phase tick (every 1 min)
SQL job runs:
```sql
select net.http_post(
  url := <VERCEL_URL>/api/cron/cascade-tick,
  headers := jsonb_build_object('Authorization', <CRON_SECRET>)
);
```

`/api/cron/cascade-tick` handler:
1. Auth via shared secret header.
2. `SELECT * FROM Match WHERE nextCascadeAt <= now() AND status != 'cancelled' AND startsAt > now()`.
3. For each match: call pure `decideCascadePhase(match, now)`:
   - If full → set `nextCascadeAt=NULL`, notify organiser if first transition.
   - If next phase enabled and not yet fired → build audience, insert
     `MatchInvitedPlayer` rows with `status='pending'`, generate tokens,
     enqueue pgmq jobs, set `currentCascadePhase` and `nextCascadeAt` (or
     NULL if last phase).
   - Else → set `nextCascadeAt=NULL` (cascade exhausted), notify organiser
     if slots open.

### Cron B — send tick (every 30s)
SQL job runs:
```sql
select net.http_post(
  url := <VERCEL_URL>/api/cron/send-tick,
  headers := jsonb_build_object('Authorization', <CRON_SECRET>)
);
```

`/api/cron/send-tick` handler:
1. Auth via shared secret.
2. `pgmq.read('invite-sends', vt := 60, qty := 25)` — visibility timeout 60s.
3. For each message: call Twilio.
   - On success: `pgmq.delete`, set `MatchInvitedPlayer.sentAt = now()`.
   - On failure: increment `sendAttempts`. If `< 3`: leave message (vt
     expires, retry). If `≥ 3`: `pgmq.archive`, set `status='expired'`,
     `sendError=<msg>`.

### Cancellation
`cancelMatch` action:
1. Set `Match.status='cancelled'`, `nextCascadeAt=NULL`.
2. Drain pgmq jobs for that match: pop and discard any with `matchId` match.
3. Mark all `pending` `MatchInvitedPlayer` rows as `expired`.
4. Send cancellation WhatsApp to all `accepted` invitees (existing already-
   sent path, separate queue or direct).

### Local dev
- Supabase CLI runs Postgres + pg_cron + pgmq locally — extensions enabled
  via `supabase/migrations/`.
- For the inner dev loop, we do **not** rely on pg_cron firing. Instead we
  expose `POST /dev/cron-tick?which=cascade|send` (mounted only in
  non-prod) and a `pnpm cron:tick` script. The dev simulator UI gains a
  "Tick cascade" / "Tick sender" button.
- `TWILIO_MOCK=true` env var makes the Twilio client log instead of
  calling the API.
- One integration smoke test verifies pg_cron actually fires the HTTP
  endpoint locally. Not part of CI on every commit.

## Consequences

**Good**
- Survives restarts: state lives in Postgres.
- Cancellable mid-cascade.
- Cron schedule is two rows we can change without redeploying.
- Sub-second latency from cron tick to send tick (Twilio fan-out feels live).
- No per-match jobs — scales without churning the cron table.
- Pure logic in TypeScript = unit testable (see ADR-0004).

**Bad / accepted trade-offs**
- Cron granularity is 30s/1min — invitations are not literally instant.
  Acceptable: humans don't measure WhatsApp deliveries in seconds.
- Two crons + pgmq + pg_net = more moving parts than a Vercel Cron job.
  Justified by the cancellation + retry requirements.
- `pg_net` HTTP requests fail silently if the URL is wrong. Mitigation:
  startup script verifies the cron rows on deploy.
- Local pg_cron has historical quirks (`cron.database_name`). Mitigated
  by sidestepping it in the dev loop via the manual tick endpoint.

## Alternatives considered

- **Vercel Cron.** Rejected — we explicitly migrated to Supabase for
  exactly this kind of primitive; no reason to add another vendor.
- **pg_cron-per-match jobs.** Scheduling and unscheduling a cron row per
  match per phase pollutes the cron table with thousands of one-shot
  jobs. Standing 1m/30s crons are simpler.
- **Direct Twilio calls inside the cascade-tick.** Couples decision and
  delivery; one slow Twilio call holds the whole tick; no retries for
  free; cancellation race becomes "what if cancel fires while we're
  mid-send". The pgmq split removes all of this.
- **Supabase Edge Functions for the send loop.** Possible, and ~150s
  timeout is generous. Rejected for now because all our app code, Twilio
  client, and domain types already live in Vercel/TypeScript; running
  send logic in Deno duplicates infrastructure for no current benefit.
  Reconsider if Vercel timeouts become a bottleneck.
