-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Player" (
    "ref" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "userId" TEXT NOT NULL,
    "playerRef" TEXT NOT NULL,

    PRIMARY KEY ("userId", "playerRef"),
    CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserFavorite_playerRef_fkey" FOREIGN KEY ("playerRef") REFERENCES "Player" ("ref") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserPreferredClub" (
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,

    PRIMARY KEY ("userId", "clubId"),
    CONSTRAINT "UserPreferredClub_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPreferredClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizerId" TEXT NOT NULL,
    "clubId" TEXT,
    "scheduledAt" DATETIME,
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
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchInvitedPlayer" (
    "matchId" TEXT NOT NULL,
    "playerRef" TEXT NOT NULL,

    PRIMARY KEY ("matchId", "playerRef"),
    CONSTRAINT "MatchInvitedPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchInvitedPlayer_playerRef_fkey" FOREIGN KEY ("playerRef") REFERENCES "Player" ("ref") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchAcceptedPlayer" (
    "matchId" TEXT NOT NULL,
    "playerRef" TEXT NOT NULL,

    PRIMARY KEY ("matchId", "playerRef"),
    CONSTRAINT "MatchAcceptedPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchAcceptedPlayer_playerRef_fkey" FOREIGN KEY ("playerRef") REFERENCES "Player" ("ref") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchConfirmedSlot" (
    "matchId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    PRIMARY KEY ("matchId", "idx"),
    CONSTRAINT "MatchConfirmedSlot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT
);

-- CreateTable
CREATE TABLE "ClubPlaytomicAlias" (
    "clubId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,

    PRIMARY KEY ("clubId", "alias"),
    CONSTRAINT "ClubPlaytomicAlias_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
