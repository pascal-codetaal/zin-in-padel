-- Phase E.1 — Supabase-only: enable pg_cron / pgmq / pg_net and create the
-- `invite-sends` queue. Split out from the previous migration so local dev on
-- vanilla Postgres can mark this as applied without running it:
--
--   pnpm prisma migrate resolve --applied 20260528120001_invite_send_queue_supabase
--
-- Prisma migrate dev replays migrations on a shadow DB; Supabase extensions
-- (pg_cron, etc.) cannot install there — we no-op on shadow databases.
--
-- All statements are idempotent — safe to re-run on Supabase.

DO $migrate$
BEGIN
  IF current_database() LIKE 'prisma_migrate_shadow_db%' THEN
    RAISE NOTICE 'invite_send_queue_supabase: skipped on Prisma shadow DB %', current_database();
    RETURN;
  END IF;

  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgmq CASCADE';
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_net';
END $migrate$;

DO $migrate$
BEGIN
  IF current_database() LIKE 'prisma_migrate_shadow_db%' THEN
    RETURN;
  END IF;

  PERFORM pgmq.create('invite-sends');
EXCEPTION
  WHEN OTHERS THEN
    -- Queue may already exist on re-run
    IF SQLERRM NOT LIKE '%already exists%' THEN
      RAISE;
    END IF;
END $migrate$;
