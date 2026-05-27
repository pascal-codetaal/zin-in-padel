/**
 * Adapter: render + send the organiser-bound WhatsApp notifications decided
 * by {@link decideAcceptNotices} / {@link decideRunnerNotices}.
 *
 * Phase E.0 mock-send path: `sendWhatsAppMessage(userId, body)` writes a
 * Message row that the dev simulator surfaces. Phase E will swap the body of
 * that helper for a real Twilio call without touching this file.
 *
 * Match-detail link is built from `BASE_URL` + organiser.manageToken so the
 * organiser can tap straight through to the roster panel.
 */

import {
  findPlayerByRef,
  findUserById,
  findUserByPhone,
} from "~/lib/db.server";
import { getClubsByIds } from "~/lib/clubs.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import { sendWhatsAppMessage } from "~/lib/whatsapp-messaging.server";
import type { Match } from "~/types/domain";
import {
  formatCascadeExhaustedNotice,
  formatInviteeAcceptedNotice,
  formatMatchFullNotice,
} from "@whatsapp-templates/organiser/notify";
import type { OrganiserNotice } from "./organiser-notify";

function getBaseUrl(): string {
  return (
    process.env.BASE_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export type OrganiserNotifyOutcome = {
  attempted: number;
  sent: number;
};

/**
 * Send every organiser notice in `notices` to the match organiser.
 * Silently no-ops if organiser is opted-out or missing.
 */
export async function notifyOrganiser(input: {
  match: Match;
  notices: OrganiserNotice[];
}): Promise<OrganiserNotifyOutcome> {
  const { match, notices } = input;
  const outcome: OrganiserNotifyOutcome = {
    attempted: notices.length,
    sent: 0,
  };
  if (notices.length === 0) return outcome;

  const organiser = await findUserById(match.organizerId);
  if (!organiser || !organiser.optedIn) return outcome;

  const clubs =
    match.clubIds.length > 0 ? await getClubsByIds(match.clubIds) : [];
  const clubName =
    clubs.length > 0
      ? clubs.map((c) => c.name).join(" / ")
      : "je match";
  const when = formatScheduledAt(match.scheduledAt);
  const matchUrl = `${getBaseUrl()}/match/${organiser.manageToken}`;

  for (const notice of notices) {
    const body = await renderNotice({ notice, clubName, when, matchUrl });
    await sendWhatsAppMessage(organiser.id, body);
    outcome.sent += 1;
  }
  return outcome;
}

async function renderNotice(input: {
  notice: OrganiserNotice;
  clubName: string;
  when: string;
  matchUrl: string;
}): Promise<string> {
  const { notice, clubName, when, matchUrl } = input;

  switch (notice.kind) {
    case "invitee-accepted": {
      const firstName = await resolveFirstName(notice.playerRef);
      return formatInviteeAcceptedNotice({
        firstName,
        clubName,
        when,
        matchUrl,
      });
    }
    case "match-full":
      return formatMatchFullNotice({ clubName, when, matchUrl });
    case "cascade-exhausted":
      return formatCascadeExhaustedNotice({
        clubName,
        when,
        openSlots: notice.openSlots,
        matchUrl,
      });
  }
}

async function resolveFirstName(playerRef: string): Promise<string> {
  const player = await findPlayerByRef(playerRef);
  if (player?.name) {
    const first = player.name.split(/\s+/)[0];
    if (first) return first;
  }
  const user = await findUserByPhone(player?.phone ?? playerRef);
  if (user) {
    return (
      user.firstName?.trim() ||
      user.profileName.split(/\s+/)[0] ||
      "Iemand"
    );
  }
  return "Iemand";
}
