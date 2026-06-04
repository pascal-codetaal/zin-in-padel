# 0005 — Invite queue on BullMQ + Redis with a dedicated worker

## Status
Accepted (2026-05-28). Supersedes ADR-0003.

> Documents the as-built system. The cascade *domain* logic (three phases,
> the pure core, `Match.nextCascadeAt`) from ADR-0004 is unchanged — this
> ADR only replaces the queue + scheduler + transport described in
> ADR-0003.

## Context
ADR-0003 chose a Supabase-native scheduler: two `pg_cron` rows calling
Vercel HTTP endpoints (`/api/cron/cascade-tick`, `/api/cron/send-tick`) via
`pg_net`, with `pgmq` as the invite-send queue. In practice that stack had
costs we didn't want to keep paying:

- **Three Supabase extensions** (`pg_cron`, `pgmq`, `pg_net`) plus Vault
  secrets, all configured by SQL migrations that are skipped on the shadow
  DB and on vanilla local Postgres — a standing source of "works on
  Supabase, not locally" drift.
- **Timing coupled to deploy host.** `pg_net` POSTs a fixed URL; phase
  advancement only happens when an external cron can reach a live HTTP
  endpoint. Cron granularity (1 min) is the floor on latency, and a bad
  URL fails silently.
- **Retries were our problem to model** on top of pgmq's visibility
  timeout, with bookkeeping spread across the queue and the
  `MatchInvitedPlayer` row.
- We were already moving the runtime to **Fly** (Docker, long-running
  processes) rather than Vercel's request/response functions, which makes a
  persistent worker holding a Redis connection the natural shape.

## Decision

### BullMQ + Redis, two queues
Use [BullMQ](https://docs.bullmq.io/) on Redis (Upstash `rediss://` in
prod). Two queues in `app/lib/cascade/queue.server.ts`:

- `invite-sends` — one job per invite. `attempts: 5`,
  `backoff: exponential 30s`, `removeOnComplete: true`.
- `cascade-phase-events` — one **delayed** job per fallback phase.
  `attempts: 1`, `removeOnComplete: true`, `removeOnFail: false`.

### Phase advancement is a delayed job, not a scan
At finalize, `scheduleCascadeFallbackEvents()` enqueues a delayed
`cascade-phase-events` job for phase 2 (`fallbackLevelDelayMinutes`) and/or
phase 3 (`fallbackLevelDelayMinutes + fallbackEveryoneDelayMinutes`). When a
job matures, the phase worker runs `runCascadeTickForMatch(matchId, now)` —
the same pure cascade core from ADR-0004. No periodic table scan in the hot
path. (`Match.nextCascadeAt` is still maintained, so the legacy scan
endpoint remains correct as an optional safety net.)

### A dedicated worker process
`scripts/worker.ts` (`pnpm worker:start`) runs two `Worker`s against the
same Redis connection. In prod it is a separate Fly process group
(`worker` in `fly.toml`), isolated from the web `app` process. Concurrency
via `SEND_WORKER_CONCURRENCY` (default 10) and `PHASE_WORKER_CONCURRENCY`
(default 5). It refuses to start unless `isInviteQueueEnabled()`.

### Deterministic job IDs for idempotency + cancellation
Job IDs encode their subject:
`match|<id>|invite|<token>|phase|<n>` and `match|<id>|cascade-phase|<n>`.
BullMQ dedupes on ID (safe double-enqueue), and `cancelInviteSendsForMatch`
removes every not-yet-run job whose ID starts with `match|<id>|` across both
queues. The send worker also checks `sentAt` before calling Twilio.

### Feature flag unchanged
`isInviteQueueEnabled()` = `INVITE_QUEUE_ENABLED === "true"` **and** a Redis
URL present (`BULLMQ_REDIS_URL` / `UPSTASH_REDIS_URL` / `REDIS_URL`). Off →
synchronous inline dispatch (`dispatchPendingInvites`) for local dev /
fallback; in that mode phases 2/3 are driven manually via `/dev/cron-tick`.

### Legacy endpoints
`/api/cron/send-tick` returns `410 Gone`. `/api/cron/cascade-tick` stays
live (scan via `runCascadeTick`) as an optional belt-and-suspenders driver;
not required when the worker is running.

## Consequences

**Good**
- One queue technology, one persistent process — no Supabase extensions,
  no Vault, no `pg_net` URL to misconfigure. Same code path locally and in
  prod (just point at a local/Upstash Redis).
- Retries, backoff, delayed jobs, and dead-lettering are BullMQ built-ins.
- Phase latency is the job delay itself, not a 1-min cron floor.
- Worker isolation: a slow Twilio call can't stall web requests.

**Bad / accepted trade-offs**
- Adds **Redis** as infra (Upstash). One more managed dependency and
  connection string.
- A long-running worker must be deployed and kept alive (Fly process
  group, `min_machines_running`). Vercel-only hosting no longer suffices.
- Two transports briefly coexist: the deprecated/legacy cron endpoints and
  the Supabase cron-row migration remain in history. The cron rows hit a
  410 (`send-tick`) and a still-valid scan (`cascade-tick`).

## Alternatives considered
- **Keep pgmq + pg_cron (ADR-0003).** Rejected for the local-drift and
  host-coupling reasons above now that the runtime is Fly, not Vercel.
- **In-process timers.** Lost on restart/deploy. Same reason ADR-0003
  rejected `setTimeout`.
- **A managed queue (SQS, etc.).** More vendor surface than a single Redis
  we already wanted for BullMQ.
