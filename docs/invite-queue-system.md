# The invite queue system

How invites flow from a finalised match to a WhatsApp message, and why we
built it this way.

> **History:** this layer originally used Supabase `pgmq` drained by
> `pg_cron` (see ADR-0003). It now runs on **BullMQ + Redis** with a
> dedicated long-running worker process. See ADR-0005 for the why of that
> switch.

## TL;DR

We use **BullMQ** (Redis-backed job queues). Finalising a match writes
invite rows to Postgres and pushes one queue job per invite, plus delayed
jobs for the later cascade phases. A dedicated **worker process**
(`scripts/worker.ts`, the Fly `worker` machine) consumes both queues:
sending invites via Twilio and firing phase 2/3 when their delay elapses.
Failed sends retry up to 5 times with exponential backoff, then land in
BullMQ's failed set for inspection. One env flag (`INVITE_QUEUE_ENABLED`)
lets us bypass the queue and send synchronously for local dev or
emergencies.

## Why a queue at all?

Without a queue: `finalizeMatchDraft()` → loop over invitees → call Twilio
API for each → return. If you invite 8 people, you sit through 8 sequential
HTTP calls. If Twilio is slow or one call fails mid-loop, the user-facing
request hangs or half-fails. Plus, web requests have a short timeout —
bursts of invites can blow past it.

With a queue: `finalizeMatchDraft()` → enqueue 8 jobs → return
immediately. The worker drains the queue at its own pace. Failures retry
automatically. The user-facing path stays fast and atomic.

## What we use: BullMQ + Redis

[BullMQ](https://docs.bullmq.io/) on a Redis instance (Upstash in prod,
`rediss://` TLS). No Postgres extensions, no `pg_cron`, no `pg_net` — the
queue lives in Redis and is driven by a process we control.

Two queues:

| Queue                   | Producer                                | Consumer                       | Purpose |
| ----------------------- | --------------------------------------- | ------------------------------ | ------- |
| `invite-sends`          | `enqueueInviteSend` (one per invite)    | send worker → Twilio           | Deliver one WhatsApp invite. |
| `cascade-phase-events`  | `enqueueCascadePhaseEvent` (delayed)    | phase worker → cascade tick    | Fire phase 2 / 3 when its delay elapses. |

Why two queues: a send is "call Twilio once, retry on failure"; a phase
event is "wake up after N minutes and advance one match". Different
cadence, different retry policy, different payload — keeping them separate
keeps each worker's logic trivial.

Redis connection comes from the first of `BULLMQ_REDIS_URL`,
`UPSTASH_REDIS_URL`, `REDIS_URL`. A `rediss://` scheme enables TLS.

## Our flow, end-to-end

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User finalises match (via agent or web)                       │
│    ↓                                                             │
│ 2. finalizeMatchDraft() — writes MatchInvitedPlayer rows         │
│    (cascadePhase=1, sentAt=null, status='pending')               │
│    ↓                                                             │
│ 3a. dispatchOrEnqueueInvites(matchId)                            │
│     ├─ Queue OFF → dispatchPendingInvites() → Twilio directly    │
│     └─ Queue ON  → enqueueInviteSend() per pending row →         │
│                    BullMQ job on 'invite-sends'                  │
│ 3b. scheduleCascadeFallbackEvents(matchId)                       │
│     └─ Queue ON  → enqueueCascadePhaseEvent() delayed jobs on    │
│                    'cascade-phase-events' (phase 2 @ levelDelay, │
│                    phase 3 @ levelDelay+everyoneDelay)           │
│    ↓                                                             │
│ 4. HTTP response returns. User sees "match created!"             │
└─────────────────────────────────────────────────────────────────┘

                       (worker process, always running)

┌─────────────────────────────────────────────────────────────────┐
│ 5. Send worker (concurrency SEND_WORKER_CONCURRENCY, default 10) │
│    consumes 'invite-sends':                                      │
│    ├─ sendInviteByToken(token, now, { deliverViaApi: true })    │
│    ├─ stamp MatchInvitedPlayer.sentAt, sendAttempts, sendError   │
│    ├─ success / skipped → job completes (removeOnComplete)      │
│    └─ failure → throw → BullMQ retries (5 attempts, exp backoff  │
│                 30s) → after attempt 5, job lands in failed set  │
│                                                                  │
│ 6. Phase worker (concurrency PHASE_WORKER_CONCURRENCY, default 5)│
│    consumes 'cascade-phase-events' when a delayed job matures:   │
│    └─ runCascadeTickForMatch(matchId, now) → advances one phase, │
│       inserts new MatchInvitedPlayer rows, enqueues their sends  │
└─────────────────────────────────────────────────────────────────┘
```

## The worker process

`scripts/worker.ts` (run as `pnpm worker:start`) boots two BullMQ `Worker`s
against the same Redis connection. In production it is a separate Fly
process group (`worker` in `fly.toml`), so a slow Twilio call or a busy
cascade tick never blocks the web `app` process. It refuses to start unless
`isInviteQueueEnabled()` is true (flag on **and** a Redis URL configured),
and shuts both workers down cleanly on `SIGINT`/`SIGTERM`.

Concurrency is tunable via `SEND_WORKER_CONCURRENCY` (default 10) and
`PHASE_WORKER_CONCURRENCY` (default 5).

## The retry semantics

`invite-sends` jobs are added with `attempts: 5` and exponential backoff
(base 30s). BullMQ itself owns redelivery:

```
attempt 1: Twilio throws → job re-queued after ~30s
attempt 2: Twilio throws → re-queued after ~60s
...
attempt 5: Twilio throws → job moves to the failed set (dead letter)
```

`cascade-phase-events` jobs use `attempts: 1` (a missed phase tick is
re-derivable from match state, not worth blind retries) and
`removeOnFail: false` so a failed phase advance stays visible for
inspection.

What we track outside the queue, on `MatchInvitedPlayer`:

- `sendAttempts` — incremented every time we try
- `sendError` — last error string (or null on success)
- `sentAt` — null until delivered

So the organiser UI can show "tried 5 times, last error: 21408
(permission denied)" even after the job is gone.

## Idempotency

Both producers build **deterministic job IDs**:

- send: `match|<matchId>|invite|<token>|phase|<n>`
- phase: `match|<matchId>|cascade-phase|<n>`

BullMQ dedupes on job ID, so a double finalize or a re-enqueue from a
cascade tick can't create duplicate jobs. Belt-and-suspenders: the send
worker checks `sentAt` before calling Twilio (`already-sent` skip), so even
a duplicate that slipped through won't double-send.

## Cancellation

Cancelling a match calls `cancelInviteSendsForMatch(matchId)`, which scans
the delayed/waiting/prioritized/paused/waiting-children states of **both**
queues and removes every job whose ID starts with `match|<matchId>|`. That
drops queued sends and not-yet-fired phase events for that match so nothing
fires after cancellation. Already-`accepted` invitees are notified through
the normal messaging path.

## Where the policy lives

| File                                            | Role                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `app/lib/cascade/queue.server.ts`               | BullMQ wrapper. `enqueueInviteSend`, `enqueueCascadePhaseEvent`, `cancelInviteSendsForMatch`, `getInviteSendQueue`, `getCascadePhaseEventQueue`, `isInviteQueueEnabled`, Redis-URL parsing. |
| `app/lib/cascade/dispatch.server.ts`            | `dispatchOrEnqueueInvites()` (flag-branches: inline send vs enqueue) and `scheduleCascadeFallbackEvents()` (delayed phase jobs). |
| `app/lib/cascade/send.server.ts`                | `sendInviteByToken()` / `dispatchPendingInvites()` — the actual Twilio send + DB stamping.                |
| `app/lib/cascade/runner.server.ts`              | `runCascadeTickForMatch()` (one match) and `runCascadeTick()` (scan all due) — pure-core adapter.         |
| `scripts/worker.ts`                             | The production worker: two BullMQ `Worker`s (send + phase). Fly `worker` process.                        |
| `app/lib/cascade/send-worker.server.ts`         | `runSendTick()` — dev-only one-shot drain of `invite-sends`, used by the simulator / `/dev/cron-tick`.    |

## The feature flag

`INVITE_QUEUE_ENABLED` env var (queue only activates when this is `"true"`
**and** a Redis URL is configured):

- **`false`** / unset / no Redis: finalize → Twilio synchronously, inside
  the request. Good for local dev without Redis, or fallback if the queue
  is broken. Cascade phases 2/3 are **not** auto-scheduled in this mode —
  drive them manually with the dev tick (below).
- **`true`** (+ Redis): finalize → enqueue. The worker drains.

Single read site: `isInviteQueueEnabled()` in `queue.server.ts`. Flip
without code changes.

## The HTTP cron endpoints (legacy)

ADR-0003 drove the cascade over two Supabase `pg_cron` → HTTP endpoints.
Those routes still exist but are no longer the production path:

- `POST /api/cron/send-tick` — **deprecated**, returns `410 Gone`
  ("use the dedicated Fly worker instead").
- `POST /api/cron/cascade-tick` — still live; runs `runCascadeTick(now)`,
  a scan of every match whose `nextCascadeAt <= now`. Harmless as an
  optional safety-net scan (idempotent job IDs prevent double sends), but
  the worker's delayed phase jobs are the primary driver. Bearer-auth via
  `CRON_SECRET`.

`Match.nextCascadeAt` is still written by the cascade core, so the scan
path stays correct if you ever re-enable it.

## Testing locally

Two scripts seed a match end-to-end (Pascal ↔ Joris, phones from `.env`):

```bash
pnpm test:pascal-invites-joris   # Pascal organiser, Joris invitee
pnpm test:joris-invites-pascal   # reverse
```

With `INVITE_QUEUE_ENABLED=false`: the invite hits Twilio synchronously
during the script; phase 2/3 must be driven manually.

With `INVITE_QUEUE_ENABLED=true` (+ a local/Upstash Redis): the script
enqueues. Either run the real worker (`pnpm worker:start`) to drain, or use
the simulator: the `CronTickPanel` "Send Tick" / "Tick cascade" buttons
(and `/dev/cron-tick?which=send|cascade`) call `runSendTick` /
`runCascadeTick` directly without needing the worker.
