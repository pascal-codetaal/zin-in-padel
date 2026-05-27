import { formatPadelLevel } from "~/types/domain";
import type { FiringPhase } from "~/lib/cascade/types";
import { slotsLabel } from "./strings";
import type { InviteMatchView, InviteOrganiser, InviteRecipient } from "./format";
import { inviteTokenFromAcceptUrl } from "./url";

export type InviteContentVariablesInput = {
  phase: FiringPhase;
  match: InviteMatchView;
  recipient: InviteRecipient;
  organiser: InviteOrganiser;
  acceptUrl: string;
  declineUrl: string;
};

/**
 * Numeric keys match Twilio Content variable placeholders {{1}}, {{2}}, …
 * in `invites/twilio/phase-*.content.json`.
 */
export function buildInviteContentVariables(
  input: InviteContentVariablesInput,
): Record<string, string> | null {
  const { phase, match, recipient, organiser, acceptUrl } = input;
  const slots = slotsLabel(match.openSlots);
  const token = inviteTokenFromAcceptUrl(acceptUrl);

  const declinePath = `${token}/nee`;

  if (phase === 1) {
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

  if (phase === 2) {
    const levelLine = levelRangeLabel(match);
    if (!levelLine) return null;
    return {
      "1": organiser.fullName,
      "2": match.clubName,
      "3": match.whenLabel,
      "4": slots,
      "5": levelLine,
      "6": token,
      "7": declinePath,
    };
  }

  return {
    "1": organiser.fullName,
    "2": match.clubName,
    "3": match.whenLabel,
    "4": slots,
    "5": token,
    "6": declinePath,
  };
}

function levelRangeLabel(match: InviteMatchView): string | null {
  if (match.fallbackLevelMin === null || match.fallbackLevelMax === null) {
    return null;
  }
  if (match.fallbackLevelMin === match.fallbackLevelMax) {
    return `Niveau ${formatPadelLevel(match.fallbackLevelMin)}`;
  }
  return `Niveau ${formatPadelLevel(match.fallbackLevelMin)} — ${formatPadelLevel(match.fallbackLevelMax)}`;
}
