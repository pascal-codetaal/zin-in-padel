# The invite queue system

How invites flow from a finalised match to a WhatsApp message, and why we
built it this way.

## TL;DR

We use **pgmq**, a Postgres-native queue. Finalising a match writes invite
rows to the DB and pushes one queue message per invite. Every minute,
**Supabase pg_cron** hits `/api/cron/send-tick`, which drains the queue
and sends via Twilio. Failures retry up to 5 times via pgmq's
visibility-timeout redelivery, then dead-letter to an archive table.
A separate cron handles cascade phase advancement
(friends → level-range → everyone). One env flag
(`INVITE_QUEUE_ENABLED`) lets us bypass the queue and send synchronously
for local dev or emergencies.

## Why a queue at all?

Without a queue: `finalizeMatch()` → loop over invitees → call Twilio API
for each → return. If you invite 8 people, you sit through 8 sequential
HTTP calls. If Twilio is slow or one call fails mid-loop, the user-facing
request hangs or half-fails. Plus, web requests on Vercel have a 10s
timeout — bursts of invites can blow past it.

With a queue: `finalizeMatch()` → write 8 rows to a queue table → return
immediately. A separate worker (cron) drains the queue at its own pace.
Failures retry automatically. The user-facing path stays fast and atomic.

## What we use: `pgmq`

Postgres extension from Tembo. Gives us a queue table living inside our
normal Supabase DB — no Redis, no SQS, no extra infra. Same connection,
same transactions, same backup.

For each queue you create (we have one: `invite-sends`), pgmq creates two
physical tables:

- `pgmq.q_invite-sends` — the live queue (pending + in-flight messages)
- `pgmq.a_invite-sends` — the archive (dead letters)

You interact via SQL functions: `pgmq.send()`, `pgmq.read()`,
`pgmq.delete()`, `pgmq.archive()`.

Each message has a **visibility timeout (VT)**: when a worker `read`s a
message, pgmq hides it for N seconds. If the worker `delete`s it before
VT expires → gone. If the worker crashes or doesn't delete → message
reappears after VT and another worker picks it up. That's how
at-least-once delivery works.

## Our flow, end-to-end

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User finalises match (via agent or web)                      │
│    ↓                                                            │
│ 2. finalizeMatchDraft() — writes MatchInvitedPlayer rows        │
│    (cascadePhase=1, sentAt=null, status='pending')              │
│    ↓                                                            │
│ 3. dispatchOrEnqueueInvites(matchId)                            │
│    ├─ Queue OFF → sendInvitesNow() → Twilio API directly        │
│    └─ Queue ON  → enqueueInviteSend() per pending row →         │
│                   pgmq.send('invite-sends', {matchId, token})   │
│    ↓                                                            │
│ 4. HTTP response returns. User sees "match created!"            │
└─────────────────────────────────────────────────────────────────┘

                            (later — every minute)

┌─────────────────────────────────────────────────────────────────┐
│ 5. Supabase pg_cron fires /api/cron/send-tick                   │
│    (pg_net.http_post with Bearer CRON_SECRET)                   │
│    ↓                                                            │
│ 6. runSendTick() — the worker                                   │
│    ├─ pgmq.read('invite-sends', vt=30s, qty=10) →               │
│    │   batch of up to 10 messages, now hidden for 30s           │
│    ├─ for each message:                                         │
│    │   ├─ handleOne() — load invite, send via Twilio (or mock)  │
│    │   ├─ stamp MatchInvitedPlayer.sentAt = now                 │
│    │   ├─ increment sendAttempts, clear sendError               │
│    │   └─ decide what to do with the message ↓                  │
│    │                                                            │
│    │   sent or skipped (terminal) → pgmq.delete(msgId)          │
│    │   failed, readCt >= 5         → pgmq.archive(msgId)        │
│    │   failed, readCt < 5          → leave it, VT expires,      │
│    │                                 next tick retries          │
│    ↓                                                            │
│ 7. Worker returns trace JSON. Cron logs it. Done.               │
└─────────────────────────────────────────────────────────────────┘
```

## The two cron jobs

Both registered in Supabase via `pg_cron`, both fire every minute:

| Job             | URL                       | What it does                                                                                                                                                                                          |
| --------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cascade-tick`  | `/api/cron/cascade-tick`  | Walks all open matches whose `nextCascadeAt <= now`. Advances them to the next cascade phase (e.g. friends → level-range → everyone), inserts new `MatchInvitedPlayer` rows, then enqueues sends for those new rows. |
| `send-tick`     | `/api/cron/send-tick`     | Drains the `invite-sends` queue and pushes invites to Twilio.                                                                                                                                         |

Separation matters: cascade advances even if Twilio is down. Sends retry
independently. One worker isn't blocked by the other.

## The retry semantics

```
attempt 1: read → Twilio throws → leave message → VT expires after 30s
attempt 2: read → Twilio throws → leave message → VT expires
...
attempt 5: read → Twilio throws → readCt >= 5 → archive to dead letter
```

What we track outside the queue, on `MatchInvitedPlayer`:

- `sendAttempts` — incremented every time we try
- `sendError` — last error string (or null on success)
- `sentAt` — null until delivered

So the organiser UI can show "tried 5 times, last error: 21408
(permission denied)" even after the queue message is gone.

## Where the policy lives

| File                                                                | Role                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `app/lib/cascade/queue.server.ts`                                   | Thin pgmq wrapper. `enqueueInviteSend`, `readInviteSendBatch`, `deleteInviteSend`, `archiveInviteSend`, `isInviteQueueEnabled`     |
| `app/lib/cascade/send.server.ts`                                    | `dispatchOrEnqueueInvites()` — branches on flag, either sync-sends (E0 path) or enqueues                                            |
| `app/lib/cascade/send-worker.server.ts`                             | `runSendTick()` — the worker loop with retry/delete/archive logic                                                                   |
| `app/routes/api.cron.send-tick.tsx`                                 | HTTP endpoint pg_cron hits. Bearer auth, calls `runSendTick()`                                                                      |
| `app/routes/dev.cron-tick.tsx`                                      | Local dev equivalent. `?which=send` runs send tick, default runs cascade tick. No auth in dev.                                      |
| `prisma/migrations/.../invite_send_attempts_and_pgmq`               | Adds `sendAttempts`/`sendError` columns + enables pg_cron/pgmq/pg_net + creates queue                                               |
| `prisma/migrations/.../supabase_cron_rows`                          | Registers the two pg_cron jobs that hit our HTTP endpoints                                                                          |

## The feature flag

`INVITE_QUEUE_ENABLED` env var:

- **`false`** (or unset): finalize → Twilio synchronously, inside the
  request. Good for local dev without pgmq, or fallback if the queue is
  broken.
- **`true`**: finalize → enqueue. Cron drains.

Single read site: `isInviteQueueEnabled()` in `queue.server.ts`. Flip
without code changes.

## Auth

`/api/cron/send-tick` and `/api/cron/cascade-tick` both check
`Authorization: Bearer ${CRON_SECRET}`. The secret lives:

- In Vercel env vars (the route reads it)
- In Supabase Vault (`vault.create_secret`) — pg_cron pulls it when
  calling `pg_net.http_post`

If `CRON_SECRET` is unset, dev bypass kicks in — useful locally, refused
in prod.

## Why it's safe

- **Atomic enqueue + DB write**: enqueue happens after
  `MatchInvitedPlayer` rows exist. Worst case: row exists but enqueue
  failed → next cascade tick re-enqueues (idempotent because we filter
  on `sentAt IS NULL`).
- **At-least-once delivery**: VT-based redelivery. Worker is idempotent —
  checking `sentAt` before sending prevents double-sends if a message
  reappears after a successful send the worker forgot to delete.
- **No lost messages**: dead letters go to `pgmq.a_invite-sends` for
  manual inspection.
- **No noisy queue**: cron is the only producer; the queue stays small
  (~hundreds of messages at peak, drained in seconds).
- **Cancel-aware**: cancelling a match calls
  `archiveInviteSendsForMatch(matchId)` to drain any queued sends for
  that match so they don't fire after cancellation.

## Testing locally

Two scripts seed a match end-to-end (Pascal ↔ Joris, phones from `.env`):

```bash
pnpm test:pascal-invites-joris   # Pascal organiser, Joris invitee
pnpm test:joris-invites-pascal   # reverse
```

With `INVITE_QUEUE_ENABLED=false`: invite hits Twilio synchronously
during the script.

With `INVITE_QUEUE_ENABLED=true`: script enqueues; click "Send Tick" in
the simulator's `CronTickPanel` (or hit `/dev/cron-tick?which=send`) to
drain.
