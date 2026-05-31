-- TV clubleden rosters (import from data/all-club-members-tv.json).

CREATE TABLE "TvMember" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "padelRanking" TEXT,
    "currentRank" INTEGER NOT NULL,
    "subCategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TvMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClubTvMembership" (
    "clubId" TEXT NOT NULL,
    "tvMemberId" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubTvMembership_pkey" PRIMARY KEY ("clubId","tvMemberId")
);

CREATE INDEX "ClubTvMembership_tvMemberId_idx" ON "ClubTvMembership"("tvMemberId");
CREATE INDEX "TvMember_name_idx" ON "TvMember"("name");

ALTER TABLE "Club" ADD COLUMN "tvClubId" INTEGER;
ALTER TABLE "Club" ADD COLUMN "tvSyncedAt" TIMESTAMP(3);

ALTER TABLE "ClubTvMembership" ADD CONSTRAINT "ClubTvMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubTvMembership" ADD CONSTRAINT "ClubTvMembership_tvMemberId_fkey" FOREIGN KEY ("tvMemberId") REFERENCES "TvMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Waitlist: link to TvMember instead of PadelstatsMember.
DELETE FROM "WaitlistSignup";

ALTER TABLE "WaitlistSignup" DROP CONSTRAINT IF EXISTS "WaitlistSignup_padelstatsMemberId_fkey";
DROP INDEX IF EXISTS "WaitlistSignup_padelstatsMemberId_idx";
ALTER TABLE "WaitlistSignup" DROP COLUMN "padelstatsMemberId";

ALTER TABLE "WaitlistSignup" ADD COLUMN "tvMemberId" INTEGER NOT NULL;

ALTER TABLE "WaitlistSignup"
  ADD CONSTRAINT "WaitlistSignup_tvMemberId_fkey"
  FOREIGN KEY ("tvMemberId") REFERENCES "TvMember"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "WaitlistSignup_tvMemberId_idx" ON "WaitlistSignup"("tvMemberId");
