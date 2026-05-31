-- Simplify waitlist: phone + name + Tennis Vlaanderen lidnummer (from API autocomplete).

ALTER TABLE "WaitlistSignup" RENAME COLUMN "tennisVlaanderenRef" TO "tvNumFed";

ALTER TABLE "WaitlistSignup"
  ADD COLUMN "tvMemberId" TEXT,
  ADD COLUMN "tvPadelRanking" TEXT;

ALTER TABLE "WaitlistSignup" DROP COLUMN "whatsappDisplayName";
ALTER TABLE "WaitlistSignup" DROP COLUMN "email";
ALTER TABLE "WaitlistSignup" DROP COLUMN "gender";
ALTER TABLE "WaitlistSignup" DROP COLUMN "padelLevel";

CREATE INDEX "WaitlistSignup_tvNumFed_idx" ON "WaitlistSignup"("tvNumFed");
