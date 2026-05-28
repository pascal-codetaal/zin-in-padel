-- Phase E.1 — invite send-path retry bookkeeping.
--
-- Adds `sendAttempts` and `sendError` to `MatchInvitedPlayer` (deferred from A2
-- in the original plan; pulled in here because the queue worker needs them).
-- The pgmq queue + extensions live in a separate migration
-- (`20260528120001_invite_send_queue_supabase`) that vanilla-Postgres dev DBs
-- can mark as applied without running.

ALTER TABLE "MatchInvitedPlayer"
  ADD COLUMN "sendAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sendError" TEXT;
