-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "contentSid" TEXT,
    "whatsappName" TEXT,
    "category" TEXT NOT NULL DEFAULT 'UTILITY',
    "approvalStatus" TEXT NOT NULL DEFAULT 'draft',
    "rejectionReason" TEXT,
    "contentSourcePath" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_contentSid_key" ON "WhatsAppTemplate"("contentSid");
