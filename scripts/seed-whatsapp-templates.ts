/**
 * Seed WhatsAppTemplate rows from whatsapp-templates/registry.ts (draft, no Twilio call).
 *
 * Run: npx tsx scripts/seed-whatsapp-templates.ts
 */
import "dotenv/config";
import { seedWhatsAppTemplateRegistry } from "../app/lib/whatsapp-templates-db.server";

async function main() {
  const result = await seedWhatsAppTemplateRegistry();
  console.log(
    `WhatsApp templates: ${result.created} created, ${result.existing} already present.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
