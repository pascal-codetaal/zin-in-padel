-- CreateTable
CREATE TABLE "MatchClub" (
    "matchId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "MatchClub_pkey" PRIMARY KEY ("matchId","clubId")
);

-- CreateIndex
CREATE INDEX "MatchClub_clubId_idx" ON "MatchClub"("clubId");

-- AddForeignKey
ALTER TABLE "MatchClub" ADD CONSTRAINT "MatchClub_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchClub" ADD CONSTRAINT "MatchClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy single clubId
INSERT INTO "MatchClub" ("matchId", "clubId")
SELECT "id", "clubId" FROM "Match" WHERE "clubId" IS NOT NULL;
