# Phase F — Production cron setup

How to wire Supabase pg_cron to drive the cascade scheduler and invite-send
queue in production.

## Prereqs

- `pg_cron`, `pgmq`, `pg_net` extensions already enabled (Phase E migrations).
- App deployed to a stable URL (Vercel, Fly, …).

## Step 1 — Pick a CRON_SECRET

Generate a long random string. Anything 32+ chars from `openssl rand -hex 32`
works.

## Step 2 — Set the secret on the app

On Vercel:

```
vercel env add CRON_SECRET production
# paste the value
vercel deploy --prod
```

On Fly: `fly secrets set CRON_SECRET=...`.

Verify after deploy:

```
curl -i https://your-app/api/cron/cascade-tick                 # 401
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app/api/cron/cascade-tick                       # 200
```

## Step 3 — Stash the URL + secret in Supabase Vault

In the Supabase SQL editor (any project with Vault enabled — it ships with
every project):

```sql
select vault.create_secret('https://your-app.vercel.app', 'app_base_url');
select vault.create_secret('paste-the-CRON_SECRET-here', 'cron_secret');
```

The cron migration reads from `vault.decrypted_secrets` at fire time, so
rotating either value is a one-line update.

## Step 4 — Apply the migration

```
pnpm db:migrate:deploy   # via DATABASE_URL
# or, for direct (session pooler) URL:
pnpm db:migrate:deploy:direct
```

This installs two cron rows:

- `cascade-tick` — every minute, POSTs `/api/cron/cascade-tick`.
- `send-tick` — every minute, POSTs `/api/cron/send-tick`.

## Step 5 — Confirm jobs are firing

In the Supabase SQL editor:

```sql
select jobid, jobname, schedule, command, active from cron.job
where jobname in ('cascade-tick', 'send-tick');

-- last 10 runs of each
select jobname, status, return_message, start_time
from cron.job_run_details d
join cron.job j using (jobid)
where j.jobname in ('cascade-tick', 'send-tick')
order by start_time desc limit 10;
```

Healthy state: `status='succeeded'`, `return_message` empty.

Then watch the app logs — you should see the `runCascadeTick` and
`runSendTick` traces fire once per minute.

## Rotating the secret

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_secret'),
  'new-value'
);
```

Then update `CRON_SECRET` on Vercel and redeploy. The next cron fire after
both sides agree will succeed; the in-between fires return 401 in app logs.

## Rolling back

```sql
select cron.unschedule('cascade-tick');
select cron.unschedule('send-tick');
```

The migration's first statement does the same `unschedule` before
re-installing, so `prisma migrate deploy` re-runs are safe.

## Local dev

This migration is **Supabase-only**. On vanilla Postgres mark it as applied
without running it:

```
pnpm prisma migrate resolve --applied 20260528120002_supabase_cron_rows
```

Locally the cascade is driven manually via `/dev/cron-tick` (or the buttons
in `/dev/simulator`). No `CRON_SECRET` needed unless `NODE_ENV=production`.
