import type { InviteMatchView, InviteOrganiser, InviteRecipient } from "./format";
import { slotsLabel } from "./strings";
import { inviteTokenFromAcceptUrl } from "./url";

export type InviteContentVariablesInput = {
  match: InviteMatchView;
  recipient: InviteRecipient;
  organiser: InviteOrganiser;
  acceptUrl: string;
  declineUrl: string;
};

/**
 * Numeric keys match Twilio Content variable placeholders {{1}}, {{2}}, …
 * in `invites/twilio/phase-1.content.json`.
 */
export function buildInviteContentVariables(
  input: InviteContentVariablesInput,
): Record<string, string> {
  const { match, recipient, organiser, acceptUrl } = input;
  const slots = slotsLabel(match.openSlots);
  const token = inviteTokenFromAcceptUrl(acceptUrl);
  const declinePath = `${token}/nee`;

  return {
    "1": recipient.firstName,
    "2": organiser.fullName,
    "3": match.clubName,
    "4": match.whenLabel,
    "5": slots,
    "6": token,
    "7": declinePath,
  };
}
