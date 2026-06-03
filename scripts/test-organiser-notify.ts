/**
 * Throwaway manual test for the organiser-notify WhatsApp fix.
 *
 * Fires ONE `invitee-accepted` organiser notice through the real send path
 * (`notifyOrganiser` → `sendWhatsAppMessage` with deliverViaApi + approved
 * template) so you can confirm the message actually lands on the organiser's
 * WhatsApp. This is the exact path that was previously broken (stored in DB,
 * never delivered to Twilio).
 *
 * It mutates NO match/invite state — the only write is the audit-log append
 * that `sendWhatsAppMessage` always performs.
 *
 * Usage:
 *   pnpm tsx scripts/test-organiser-notify.ts <organiser-manage-token> [inviteeName] [matchId]
 *
 * The manage token is the `{token}` in the organiser's /match/{token} URL.
 * inviteeName defaults to "Tom" and only affects the rendered "{name} doet mee" line.
 * matchId pins a specific match; omitted → the organiser's most recent non-draft match.
 */

import { findUserByManageToken, findMatchesByOrganizer } from "../app/lib/db.server";
import { notifyOrganiser } from "../app/lib/cascade/organiser-notify.server";
import { findApprovedWhatsAppTemplate } from "../app/lib/whatsapp-templates-db.server";
import { ORGANISER_NOTIFY_WHATSAPP_TEMPLATE_ID } from "../whatsapp-templates/registry";
import type { OrganiserNotice } from "../app/lib/cascade/organiser-notify";

async function main() {
  const manageToken = process.argv[2];
  const inviteeName = process.argv[3] ?? "Tom";
  const matchId = process.argv[4];

  if (!manageToken) {
    console.error(
      "Usage: pnpm tsx scripts/test-organiser-notify.ts <organiser-manage-token> [inviteeName]",
    );
    process.exit(1);
  }

  const organiser = await findUserByManageToken(manageToken);
  if (!organiser) {
    console.error(`No User found for manage token ${manageToken}`);
    process.exit(1);
  }
  console.log(
    `Organiser: ${organiser.firstName ?? organiser.profileName} (id=${organiser.id}, phone=${organiser.phone}, optedIn=${organiser.optedIn})`,
  );

  const template = await findApprovedWhatsAppTemplate(
    ORGANISER_NOTIFY_WHATSAPP_TEMPLATE_ID,
  );
  console.log(
    template?.contentSid
      ? `Template: approved → sending via Twilio Content ${template.contentSid}`
      : "Template: NOT approved → would fall back to freeform (in-window only)",
  );

  const matches = await findMatchesByOrganizer(organiser.id);
  if (matches.length === 0) {
    console.error("Organiser has no non-draft matches to notify about.");
    process.exit(1);
  }
  const match = matchId
    ? matches.find((m) => m.id === matchId)
    : matches[0];
  if (!match) {
    console.error(
      matchId
        ? `Match ${matchId} not found among this organiser's matches.`
        : "No match available.",
    );
    process.exit(1);
  }
  console.log(
    `Match: id=${match.id} clubIds=${JSON.stringify(match.clubIds)} scheduledAt=${match.scheduledAt}`,
  );

  // playerRef is used only to render "{firstName} doet mee" — a raw name works.
  const notices: OrganiserNotice[] = [
    { kind: "invitee-accepted", playerRef: inviteeName },
  ];

  console.log("\nSending notice…");
  const outcome = await notifyOrganiser({ match, notices });
  console.log(
    `Done. attempted=${outcome.attempted} sent=${outcome.sent}\n` +
      "Check the organiser's WhatsApp for the message.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
