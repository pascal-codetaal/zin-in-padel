-- Landing-page waitlist for viability testing (see / and WaitlistSignup).

CREATE TABLE "WaitlistSignup" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "whatsappDisplayName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "tennisVlaanderenRef" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "padelLevel" INTEGER NOT NULL,
    "email" TEXT,
    "consent" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistSignup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WaitlistSignup_phone_key" ON "WaitlistSignup"("phone");
CREATE INDEX "WaitlistSignup_createdAt_idx" ON "WaitlistSignup"("createdAt");
