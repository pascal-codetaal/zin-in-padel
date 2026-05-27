/**
 * Poll Twilio for WhatsApp approval status and update WhatsAppTemplate rows.
 *
 * Run: npx tsx scripts/sync-whatsapp-templates.ts
 */
import "dotenv/config";
import {
  listWhatsAppTemplates,
  seedWhatsAppTemplateRegistry,
  syncAllWhatsAppTemplateApprovals,
} from "../app/lib/whatsapp-templates-db.server";

async function main() {
  await seedWhatsAppTemplateRegistry();
  const before = await listWhatsAppTemplates();
  const results = await syncAllWhatsAppTemplateApprovals();
  const after = await listWhatsAppTemplates();

  console.log("Sync results:");
  for (const row of results) {
    const detail = after.find((t) => t.id === row.id);
    const prefix = row.skipped ? "skip" : "sync";
    console.log(
      `  [${prefix}] ${row.id}: ${row.status}${detail?.contentSid ? ` (${detail.contentSid})` : ""}${detail?.rejectionReason ? ` — ${detail.rejectionReason}` : ""}`,
    );
  }

  const withoutSid = before.filter((t) => !t.contentSid).map((t) => t.id);
  if (withoutSid.length > 0) {
    console.log(
      "\nNo ContentSid yet (register first):",
      withoutSid.join(", "),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
