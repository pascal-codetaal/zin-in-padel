-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "manageToken" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "profileName" TEXT NOT NULL,
    "optedIn" BOOLEAN NOT NULL DEFAULT false,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "onboardingStep" INTEGER,
    "activeFlow" TEXT,
    "pendingFriendName" TEXT,
    "gender" TEXT,
    "level" INTEGER,
    "preferredSide" TEXT,
    "playsBothSides" BOOLEAN NOT NULL DEFAULT false,
    "matchPreference" TEXT,
    "matchLevelMin" INTEGER,
    "matchLevelMax" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "userId" TEXT NOT NULL,
    "playerRef" TEXT NOT NULL,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("userId","playerRef")
);

-- CreateTable
CREATE TABLE "UserPreferredClub" (
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "UserPreferredClub_pkey" PRIMARY KEY ("userId","clubId")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "clubId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 90,
    "format" TEXT NOT NULL,
    "totalSlots" INTEGER NOT NULL DEFAULT 4,
    "fallbackToLevelRange" BOOLEAN NOT NULL DEFAULT false,
    "fallbackLevelMin" INTEGER,
    "fallbackLevelMax" INTEGER,
    "fallbackLevelDelayMinutes" INTEGER NOT NULL DEFAULT 30,
    "fallbackToEveryone" BOOLEAN NOT NULL DEFAULT false,
    "fallbackEveryoneDelayMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchInvitedPlayer" (
    "matchId" TEXT NOT NULL,
    "playerRef" TEXT NOT NULL,

    CONSTRAINT "MatchInvitedPlayer_pkey" PRIMARY KEY ("matchId","playerRef")
);

-- CreateTable
CREATE TABLE "MatchAcceptedPlayer" (
    "matchId" TEXT NOT NULL,
    "playerRef" TEXT NOT NULL,

    CONSTRAINT "MatchAcceptedPlayer_pkey" PRIMARY KEY ("matchId","playerRef")
);

-- CreateTable
CREATE TABLE "MatchConfirmedSlot" (
    "matchId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MatchConfirmedSlot_pkey" PRIMARY KEY ("matchId","idx")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPlaytomicAlias" (
    "clubId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,

    CONSTRAINT "ClubPlaytomicAlias_pkey" PRIMARY KEY ("clubId","alias")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_manageToken_key" ON "User"("manageToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_waId_key" ON "User"("waId");

-- CreateIndex
CREATE INDEX "UserFavorite_playerRef_idx" ON "UserFavorite"("playerRef");

-- CreateIndex
CREATE INDEX "UserPreferredClub_clubId_idx" ON "UserPreferredClub"("clubId");

-- CreateIndex
CREATE INDEX "Match_organizerId_idx" ON "Match"("organizerId");

-- CreateIndex
CREATE INDEX "Match_clubId_idx" ON "Match"("clubId");

-- CreateIndex
CREATE INDEX "MatchInvitedPlayer_playerRef_idx" ON "MatchInvitedPlayer"("playerRef");

-- CreateIndex
CREATE INDEX "MatchAcceptedPlayer_playerRef_idx" ON "MatchAcceptedPlayer"("playerRef");

-- CreateIndex
CREATE INDEX "Message_userId_at_idx" ON "Message"("userId", "at");

-- CreateIndex
CREATE INDEX "ClubPlaytomicAlias_aliasNormalized_idx" ON "ClubPlaytomicAlias"("aliasNormalized");

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_playerRef_fkey" FOREIGN KEY ("playerRef") REFERENCES "Player"("ref") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferredClub" ADD CONSTRAINT "UserPreferredClub_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferredClub" ADD CONSTRAINT "UserPreferredClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchInvitedPlayer" ADD CONSTRAINT "MatchInvitedPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchInvitedPlayer" ADD CONSTRAINT "MatchInvitedPlayer_playerRef_fkey" FOREIGN KEY ("playerRef") REFERENCES "Player"("ref") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAcceptedPlayer" ADD CONSTRAINT "MatchAcceptedPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAcceptedPlayer" ADD CONSTRAINT "MatchAcceptedPlayer_playerRef_fkey" FOREIGN KEY ("playerRef") REFERENCES "Player"("ref") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchConfirmedSlot" ADD CONSTRAINT "MatchConfirmedSlot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPlaytomicAlias" ADD CONSTRAINT "ClubPlaytomicAlias_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
