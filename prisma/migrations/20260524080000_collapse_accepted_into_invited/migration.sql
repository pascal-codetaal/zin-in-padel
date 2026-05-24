-- Collapse MatchAcceptedPlayer into MatchInvitedPlayer and add cascade state.
-- See docs/adr/0002-collapse-accepted-into-invited.md.

-- 1. Extend MatchInvitedPlayer with the new fields. Token is nullable for the
--    backfill step, then made NOT NULL + UNIQUE.
ALTER TABLE "MatchInvitedPlayer"
  ADD COLUMN "token" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "cascadePhase" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "respondedAt" TIMESTAMP(3);

-- 2. Backfill tokens for existing rows (opaque random base62, 22 chars).
--    Using gen_random_uuid() + base64 trimmed since pgcrypto is enabled in
--    Supabase by default; collisions across 22-char base62 are negligible.
UPDATE "MatchInvitedPlayer"
SET "token" = substr(
  translate(encode(gen_random_bytes(18), 'base64'), '+/=', 'ABC'),
  1, 22
)
WHERE "token" IS NULL;

ALTER TABLE "MatchInvitedPlayer" ALTER COLUMN "token" SET NOT NULL;
CREATE UNIQUE INDEX "MatchInvitedPlayer_token_key" ON "MatchInvitedPlayer"("token");
CREATE INDEX "MatchInvitedPlayer_matchId_status_idx" ON "MatchInvitedPlayer"("matchId", "status");

-- 3. Backfill status='accepted' for rows that exist in MatchAcceptedPlayer.
UPDATE "MatchInvitedPlayer" mip
SET
  "status" = 'accepted',
  "respondedAt" = NOW()
FROM "MatchAcceptedPlayer" map
WHERE mip."matchId" = map."matchId"
  AND mip."playerRef" = map."playerRef";

-- 4. Insert any MatchAcceptedPlayer rows that have no matching invited row
--    (shouldn't happen in practice, but defensive).
INSERT INTO "MatchInvitedPlayer" ("matchId", "playerRef", "token", "status", "cascadePhase", "respondedAt")
SELECT
  map."matchId",
  map."playerRef",
  substr(translate(encode(gen_random_bytes(18), 'base64'), '+/=', 'ABC'), 1, 22),
  'accepted',
  1,
  NOW()
FROM "MatchAcceptedPlayer" map
WHERE NOT EXISTS (
  SELECT 1 FROM "MatchInvitedPlayer" mip
  WHERE mip."matchId" = map."matchId" AND mip."playerRef" = map."playerRef"
);

-- 5. Drop MatchAcceptedPlayer.
ALTER TABLE "MatchAcceptedPlayer" DROP CONSTRAINT "MatchAcceptedPlayer_matchId_fkey";
ALTER TABLE "MatchAcceptedPlayer" DROP CONSTRAINT "MatchAcceptedPlayer_playerRef_fkey";
DROP INDEX IF EXISTS "MatchAcceptedPlayer_playerRef_idx";
DROP TABLE "MatchAcceptedPlayer";

-- 6. Add cascade state to Match.
ALTER TABLE "Match"
  ADD COLUMN "currentCascadePhase" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextCascadeAt" TIMESTAMP(3);

CREATE INDEX "Match_nextCascadeAt_idx" ON "Match"("nextCascadeAt");
