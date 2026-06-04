-- Waitlist links to imported PadelstatsMember + optional Club.

DELETE FROM "WaitlistSignup";

ALTER TABLE "WaitlistSignup" DROP COLUMN IF EXISTS "firstName";
ALTER TABLE "WaitlistSignup" DROP COLUMN IF EXISTS "lastName";
ALTER TABLE "WaitlistSignup" DROP COLUMN IF EXISTS "tvNumFed";
ALTER TABLE "WaitlistSignup" DROP COLUMN IF EXISTS "tvMemberId";
ALTER TABLE "WaitlistSignup" DROP COLUMN IF EXISTS "tvPadelRanking";

ALTER TABLE "WaitlistSignup" ADD COLUMN "padelstatsMemberId" INTEGER NOT NULL;
ALTER TABLE "WaitlistSignup" ADD COLUMN "clubId" TEXT;

ALTER TABLE "WaitlistSignup"
  ADD CONSTRAINT "WaitlistSignup_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "WaitlistSignup_tvNumFed_idx";
CREATE INDEX "WaitlistSignup_padelstatsMemberId_idx" ON "WaitlistSignup"("padelstatsMemberId");
CREATE INDEX "WaitlistSignup_clubId_idx" ON "WaitlistSignup"("clubId");
