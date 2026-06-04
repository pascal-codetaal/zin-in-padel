ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

CREATE TABLE "ReferralAttribution" (
  "id" TEXT NOT NULL,
  "campaignSlug" TEXT NOT NULL,
  "inviterId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attributedAt" TIMESTAMP(3) NOT NULL,
  "qualifiedAt" TIMESTAMP(3),
  "disqualifiedAt" TIMESTAMP(3),

  CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralAttribution_referredUserId_key"
  ON "ReferralAttribution"("referredUserId");

CREATE UNIQUE INDEX "ReferralAttribution_campaignSlug_inviterId_referredUserId_key"
  ON "ReferralAttribution"("campaignSlug", "inviterId", "referredUserId");

CREATE INDEX "ReferralAttribution_campaignSlug_status_qualifiedAt_idx"
  ON "ReferralAttribution"("campaignSlug", "status", "qualifiedAt");

CREATE INDEX "ReferralAttribution_inviterId_idx"
  ON "ReferralAttribution"("inviterId");

CREATE INDEX "ReferralAttribution_attributedAt_idx"
  ON "ReferralAttribution"("attributedAt");

ALTER TABLE "ReferralAttribution"
  ADD CONSTRAINT "ReferralAttribution_inviterId_fkey"
  FOREIGN KEY ("inviterId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralAttribution"
  ADD CONSTRAINT "ReferralAttribution_referredUserId_fkey"
  FOREIGN KEY ("referredUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
