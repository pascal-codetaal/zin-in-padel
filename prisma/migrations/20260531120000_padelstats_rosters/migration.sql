-- Padelstats club rosters (imported from data/all-club-members.json)

ALTER TABLE "Club" ADD COLUMN "padelstatsClubId" INTEGER;
ALTER TABLE "Club" ADD COLUMN "padelstatsSyncedAt" TIMESTAMP(3);

CREATE TABLE "PadelstatsMember" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "currentRank" INTEGER NOT NULL,
    "predictedRank" INTEGER NOT NULL,
    "subCategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelstatsMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClubPadelstatsMembership" (
    "clubId" TEXT NOT NULL,
    "padelstatsMemberId" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPadelstatsMembership_pkey" PRIMARY KEY ("clubId","padelstatsMemberId")
);

CREATE INDEX "Club_padelstatsClubId_idx" ON "Club"("padelstatsClubId");
CREATE INDEX "ClubPadelstatsMembership_padelstatsMemberId_idx" ON "ClubPadelstatsMembership"("padelstatsMemberId");
CREATE INDEX "PadelstatsMember_name_idx" ON "PadelstatsMember"("name");

ALTER TABLE "ClubPadelstatsMembership" ADD CONSTRAINT "ClubPadelstatsMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubPadelstatsMembership" ADD CONSTRAINT "ClubPadelstatsMembership_padelstatsMemberId_fkey" FOREIGN KEY ("padelstatsMemberId") REFERENCES "PadelstatsMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
