-- Phase E.1 — Supabase-only: enable pg_cron / pgmq / pg_net and create the
-- `invite-sends` queue. Split out from the previous migration so local dev on
-- vanilla Postgres can mark this as applied without running it:
--
--   pnpm prisma migrate resolve --applied 20260528120001_invite_send_queue_supabase
--
-- All statements are idempotent — safe to re-run on Supabase.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgmq CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT pgmq.create('invite-sends');
