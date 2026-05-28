-- Phase F.1 — Supabase pg_cron rows that drive the cascade scheduler and
-- the invite-send queue drainer.
--
-- Requires two Supabase Vault secrets to exist before running:
--   app_base_url  — e.g. https://zin-in-padel.vercel.app  (no trailing slash)
--   cron_secret   — same value as the CRON_SECRET env on Vercel
--
-- Create them once in the Supabase SQL editor (or dashboard → Vault):
--   select vault.create_secret('https://your.vercel.app', 'app_base_url');
--   select vault.create_secret('your-long-random-string', 'cron_secret');
--
-- Vanilla Postgres / local dev: mark this migration as applied without
-- running it:
--   pnpm prisma migrate resolve --applied 20260528120002_supabase_cron_rows
--
-- All statements are idempotent — safe to re-run on Supabase.

-- Drop any prior versions so re-runs replace the schedule cleanly.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('cascade-tick', 'send-tick');

-- cascade-tick — every minute. Advances all matches whose nextCascadeAt
-- has elapsed, by one cascade phase. Body is empty; auth is the bearer
-- header.
SELECT cron.schedule(
  'cascade-tick',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_base_url') || '/api/cron/cascade-tick',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$
);

-- send-tick — every minute. Drains a batch of pgmq invite-send messages
-- and dispatches via Twilio. Re-runs failed messages on each tick until
-- the worker archives them.
SELECT cron.schedule(
  'send-tick',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_base_url') || '/api/cron/send-tick',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$
);
