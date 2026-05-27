/**
 * Create a Content template in Twilio from repo JSON and submit for WhatsApp approval.
 *
 * Run:
 *   npx tsx scripts/register-whatsapp-template.ts invite_phase_1
 *   npx tsx scripts/register-whatsapp-template.ts invite_phase_2 --no-submit
 *   npx tsx scripts/register-whatsapp-template.ts --all
 */
import "dotenv/config";
import {
  registerWhatsAppTemplateFromRepo,
  setWhatsAppTemplateContentSid,
  syncWhatsAppTemplateApproval,
} from "../app/lib/whatsapp-templates-db.server";
import { WHATSAPP_TEMPLATE_REGISTRY } from "../whatsapp-templates/registry";

function usage(): never {
  console.error(`Usage:
  npx tsx scripts/register-whatsapp-template.ts <template-id>
  npx tsx scripts/register-whatsapp-template.ts --all
  npx tsx scripts/register-whatsapp-template.ts --set-sid <template-id> <HX…>

Known ids: ${WHATSAPP_TEMPLATE_REGISTRY.map((t) => t.id).join(", ")}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const noSubmit = args.includes("--no-submit");

  if (args[0] === "--set-sid") {
    const templateId = args[1];
    const contentSid = args[2];
    if (!templateId || !contentSid) usage();
    await setWhatsAppTemplateContentSid({ templateId, contentSid });
    const synced = await syncWhatsAppTemplateApproval(templateId);
    console.log(synced);
    return;
  }

  const ids =
    args[0] === "--all"
      ? WHATSAPP_TEMPLATE_REGISTRY.map((t) => t.id)
      : [args[0]];

  for (const id of ids) {
    if (!WHATSAPP_TEMPLATE_REGISTRY.some((t) => t.id === id)) {
      console.error(`Unknown template id: ${id}`);
      process.exit(1);
    }
    console.log(`Registering ${id}…`);
    const row = await registerWhatsAppTemplateFromRepo(id, {
      submitApproval: !noSubmit,
    });
    console.log(
      `  contentSid=${row.contentSid} approvalStatus=${row.approvalStatus}`,
    );
    if (row.rejectionReason) {
      console.log(`  rejectionReason=${row.rejectionReason}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
