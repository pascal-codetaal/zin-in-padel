/**
 * Pure formatters for cascade-driven WhatsApp messages. Dutch templates
 * per phase, with dual ✅ Ja / ❌ Nee deep links. No I/O — caller passes
 * the fully-resolved accept/decline URLs.
 *
 * See CONTEXT.md "Match Invite" section for the locked message contract.
 */

import { formatPadelLevel, type Match } from "~/types/domain";
import type { FiringPhase } from "./types";

export type InviteRecipient = {
  /** Invitee's first name. Used only in phase 1's personal greeting. */
  firstName: string;
};

export type InviteOrganiser = {
  /** Full name of the organiser ("Jan Janssens"). */
  fullName: string;
};

export type InviteMatchView = {
  /** Resolved club display name ("Padel Vlaanderen Brussel"). */
  clubName: string;
  /** Pre-formatted scheduled-at string ("vrijdag 5 juni — 19:00"). */
  whenLabel: string;
  /** Remaining open slots at the moment of send. */
  openSlots: number;
  format: Match["format"];
  fallbackLevelMin: Match["fallbackLevelMin"];
  fallbackLevelMax: Match["fallbackLevelMax"];
};

const STOP_FOOTER = "Stuur STOP om geen uitnodigingen meer te ontvangen.";

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
  lines.push(`✅ Ja, ik doe mee: ${acceptUrl}`);
  lines.push(`❌ Nee, andere keer: ${declineUrl}`);
  lines.push("");
  lines.push(STOP_FOOTER);

  return lines.join("\n");
}

function opener(
  phase: FiringPhase,
  recipient: InviteRecipient,
  organiser: InviteOrganiser,
  match: InviteMatchView,
): string {
  if (phase === 1) {
    return `Hey ${recipient.firstName}! ${organiser.fullName} nodigt je uit voor een padelmatch.`;
  }
  if (phase === 2) {
    return `${organiser.fullName} zoekt nog spelers op jouw niveau voor een padelmatch in ${match.clubName}.`;
  }
  return `${organiser.fullName} zoekt nog spelers voor een padelmatch in ${match.clubName}. Zin om mee te doen?`;
}

function slotsLabel(openSlots: number): string {
  if (openSlots === 1) return "Nog 1 plek vrij";
  return `Nog ${openSlots} plekken vrij`;
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
