# Production setup — Fly worker + Redis

How the cascade scheduler and invite-send queue run in production: a
dedicated **Fly worker process** consuming **BullMQ** queues on Redis.

> Supersedes the old Supabase `pg_cron` + `pgmq` setup (see ADR-0003 →
> ADR-0005). The `/api/cron/send-tick` endpoint is gone (`410`); the
> `pg_cron` migration rows, if still installed, are an optional safety-net
> only (`cascade-tick` scan) and are **not** required.

## Prereqs

- App + worker images deploy to Fly (`fly.toml` defines two process
  groups: `app` and `worker`).
- A Redis instance reachable over TLS. Upstash gives you a `rediss://` URL.
- Supabase Postgres reachable (`DATABASE_URL` pooler, `DIRECT_URL` direct).

## Step 1 — Deploy

```bash
sh scripts/fly-deploy.sh      # launches the app if missing, then `fly deploy`
# or, once the app exists:
fly deploy
```

`fly-deploy.sh` also runs `fly scale count app=1 worker=1` so both process
groups have a machine. The `app` machine serves HTTP (`pnpm run start`);
the `worker` machine runs `pnpm run worker:start`.

## Step 2 — Set secrets

```bash
fly secrets set INVITE_QUEUE_ENABLED=true
fly secrets set BULLMQ_REDIS_URL='rediss://default:<password>@<host>:<port>'
fly secrets set DATABASE_URL='postgresql://...:6543/postgres?pgbouncer=true'
fly secrets set DIRECT_URL='postgresql://...:5432/postgres'
fly secrets set OPENAI_API_KEY='sk-...'
fly secrets set TWILIO_ACCOUNT_SID='AC...' TWILIO_AUTH_TOKEN='...' \
  TWILIO_WHATSAPP_FROM='whatsapp:+...'
```

The worker **refuses to start** unless `INVITE_QUEUE_ENABLED=true` and a
Redis URL is set (`BULLMQ_REDIS_URL` / `UPSTASH_REDIS_URL` / `REDIS_URL`).

Optional worker tuning (defaults shown):

```bash
fly secrets set SEND_WORKER_CONCURRENCY=10
fly secrets set PHASE_WORKER_CONCURRENCY=5
```

Setting secrets restarts the affected machines.

## Step 3 — Apply migrations

```bash
pnpm db:migrate:deploy
```

## Step 4 — Confirm the worker is alive

```bash
fly status
fly machines list           # expect one 'app' and one 'worker' machine
fly logs -i <worker-machine-id>
```

Healthy worker logs show:

```
Workers started { sendQueue: 'invite-sends', phaseQueue: 'cascade-phase-events', sendConcurrency: 10, phaseConcurrency: 5 }
```

## Step 5 — Smoke-test with a real match

```bash
pnpm test:pascal-invites-joris
```

- Phase-1 invite arrives on `+TEST_JORIS_PHONE` (enqueued at finalize,
  sent by the worker within seconds).
- The fallback phases fire automatically when their delayed jobs mature
  (`fallbackLevelDelayMinutes`, then `+fallbackEveryoneDelayMinutes`). Set
  small delays in the script to verify quickly.

## How it advances (no cron needed)

- New match → phase-1 invites **enqueued** at finalize; the send worker
  delivers them.
- Phase 2 / 3 → **delayed** `cascade-phase-events` jobs enqueued at
  finalize; the phase worker runs `runCascadeTickForMatch` when each
  matures, inserting and enqueuing the next ring of invites.
- Failed Twilio sends → retried up to 5× (exp backoff) by BullMQ, then
  land in the failed set.
- Cancelling a match removes its not-yet-run jobs from both queues.

## Legacy Supabase cron (optional, not required)

If the `20260528120002_supabase_cron_rows` migration was applied on
Supabase, two `pg_cron` rows still POST the HTTP endpoints every minute:

- `send-tick` → now returns `410 Gone`. Harmless, but you can unschedule
  it.
- `cascade-tick` → runs a `runCascadeTick` scan; idempotent, so it's a safe
  redundant driver, but the worker already does this work.

Unschedule them if you want a clean cron table:

```sql
select cron.unschedule('cascade-tick');
select cron.unschedule('send-tick');
```

## Local dev

`INVITE_QUEUE_ENABLED` unset → invites send synchronously inline at
finalize, and the cascade is driven manually via `/dev/cron-tick` (or the
buttons in `/dev/simulator`). To exercise the real queue locally, point
`BULLMQ_REDIS_URL` at a local/Upstash Redis, set
`INVITE_QUEUE_ENABLED=true`, and run `pnpm worker:start` alongside
`pnpm dev`.
