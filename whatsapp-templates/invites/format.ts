/**
 * Pure formatters for cascade-driven WhatsApp invite messages.
 * See CONTEXT.md "Match Invite" and whatsapp-templates/README.md.
 */

import { formatPadelLevel, type Match } from "~/types/domain";
import type { FiringPhase } from "~/lib/cascade/types";
import {
  INVITE_ACCEPT_LINE_PREFIX,
  INVITE_DECLINE_LINE_PREFIX,
  INVITE_STOP_FOOTER,
} from "../shared";
import { INVITE_OPENERS, slotsLabel } from "./strings";

export type InviteRecipient = {
  firstName: string;
};

export type InviteOrganiser = {
  fullName: string;
};

export type InviteMatchView = {
  clubName: string;
  whenLabel: string;
  openSlots: number;
  format: Match["format"];
  fallbackLevelMin: Match["fallbackLevelMin"];
  fallbackLevelMax: Match["fallbackLevelMax"];
};

export function formatInviteMessage(args: {
  phase: FiringPhase;
  match: InviteMatchView;
  recipient: InviteRecipient;
  organiser: InviteOrganiser;
  acceptUrl: string;
  declineUrl: string;
}): string {
  const { phase, match, recipient, organiser, acceptUrl, declineUrl } = args;

  const lines: string[] = [];
  lines.push(opener(phase, recipient, organiser, match));
  lines.push("");
  lines.push(`📍 ${match.clubName}`);
  lines.push(`📅 ${match.whenLabel}`);
  lines.push(`👥 ${slotsLabel(match.openSlots)}`);
  if (phase === 2) {
    const levelLine = levelRangeLabel(match);
    if (levelLine) lines.push(`🎯 ${levelLine}`);
  }
  lines.push("");
  lines.push(`${INVITE_ACCEPT_LINE_PREFIX} ${acceptUrl}`);
  lines.push(`${INVITE_DECLINE_LINE_PREFIX} ${declineUrl}`);
  lines.push("");
  lines.push(INVITE_STOP_FOOTER);

  return lines.join("\n");
}

function opener(
  phase: FiringPhase,
  recipient: InviteRecipient,
  organiser: InviteOrganiser,
  match: InviteMatchView,
): string {
  if (phase === 1) {
    return INVITE_OPENERS[1]
      .replace("{{firstName}}", recipient.firstName)
      .replace("{{organiserFullName}}", organiser.fullName);
  }
  if (phase === 2) {
    return INVITE_OPENERS[2]
      .replace("{{organiserFullName}}", organiser.fullName)
      .replace("{{clubName}}", match.clubName);
  }
  return INVITE_OPENERS[3]
    .replace("{{organiserFullName}}", organiser.fullName)
    .replace("{{clubName}}", match.clubName);
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
