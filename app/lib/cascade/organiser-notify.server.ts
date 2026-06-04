/**
 * Adapter: render + send the organiser-bound WhatsApp notifications decided
 * by {@link decideAcceptNotices} / {@link decideRunnerNotices}.
 *
 * Delivers via Twilio (`deliverViaApi: true`). When the `organiser-notify`
 * template is approved, the rendered notice text is sent as Content variable
 * {{1}} with the manage token as {{2}} (so it works outside the 24h session
 * window). Until approval lands, `findApprovedWhatsAppTemplate` returns null
 * and the send falls back to freeform — identical to the cascade invite path.
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
import { findApprovedWhatsAppTemplate } from "~/lib/whatsapp-templates-db.server";
import type { Match } from "~/types/domain";
import {
  formatCascadeExhaustedLine,
  formatCascadeExhaustedNotice,
  formatInviteeAcceptedLine,
  formatInviteeAcceptedNotice,
  formatInviteeLeftLine,
  formatInviteeLeftNotice,
  formatMatchFullLine,
  formatMatchFullNotice,
} from "@whatsapp-templates/organiser/notify";
import { buildOrganiserNotifyContentVariables } from "@whatsapp-templates/organiser/variables";
import { ORGANISER_NOTIFY_WHATSAPP_TEMPLATE_ID } from "@whatsapp-templates/registry";
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
  const matchToken = organiser.manageToken;
  const matchUrl = `${getBaseUrl()}/match/${matchToken}/${match.id}`;

  const templateRow = await findApprovedWhatsAppTemplate(
    ORGANISER_NOTIFY_WHATSAPP_TEMPLATE_ID,
  );

  for (const notice of notices) {
    const { body, line } = await renderNotice({
      notice,
      clubName,
      when,
      matchUrl,
      favoriteNames: organiser.favoriteNames,
    });
    await sendWhatsAppMessage(organiser.id, body, {
      deliverViaApi: true,
      twilioTemplate: templateRow?.contentSid
        ? {
            contentSid: templateRow.contentSid,
            contentVariables: buildOrganiserNotifyContentVariables({
              body: line,
              matchToken,
            }),
          }
        : undefined,
    });
    outcome.sent += 1;
  }
  return outcome;
}

/**
 * `body` is the freeform multi-line text (audit log + freeform fallback send).
 * `line` is the single-line, URL-free variant used as Content variable {{1}}
 * (Twilio rejects newlines in content variables; the link is the {{2}} button).
 */
async function renderNotice(input: {
  notice: OrganiserNotice;
  clubName: string;
  when: string;
  matchUrl: string;
  favoriteNames: Record<string, string>;
}): Promise<{ body: string; line: string }> {
  const { notice, clubName, when, matchUrl, favoriteNames } = input;

  switch (notice.kind) {
    case "invitee-accepted": {
      const firstName = await resolveFirstName(notice.playerRef, favoriteNames);
      return {
        body: formatInviteeAcceptedNotice({ firstName, clubName, when, matchUrl }),
        line: formatInviteeAcceptedLine({ firstName, clubName, when }),
      };
    }
    case "invitee-left": {
      const firstName = await resolveFirstName(notice.playerRef, favoriteNames);
      return {
        body: formatInviteeLeftNotice({ firstName, clubName, when, matchUrl }),
        line: formatInviteeLeftLine({ firstName, clubName, when }),
      };
    }
    case "match-full":
      return {
        body: formatMatchFullNotice({ clubName, when, matchUrl }),
        line: formatMatchFullLine({ clubName, when }),
      };
    case "cascade-exhausted":
      return {
        body: formatCascadeExhaustedNotice({
          clubName,
          when,
          openSlots: notice.openSlots,
          matchUrl,
        }),
        line: formatCascadeExhaustedLine({
          clubName,
          when,
          openSlots: notice.openSlots,
        }),
      };
  }
}

async function resolveFirstName(
  playerRef: string,
  favoriteNames: Record<string, string>,
): Promise<string> {
  const nickname = favoriteNames[playerRef];
  if (nickname) {
    const first = nickname.split(/\s+/)[0];
    if (first) return first;
  }
  const player = await findPlayerByRef(playerRef);
  // A registered owner's real name beats the Player stub (which may hold a
  // stale label a friend-adder typed).
  const user = await findUserByPhone(player?.phone ?? playerRef);
  if (user) {
    const userFirst =
      user.firstName?.trim() || user.profileName.split(/\s+/)[0]?.trim();
    if (userFirst) return userFirst;
  }
  if (player?.name) {
    const first = player.name.split(/\s+/)[0];
    if (first) return first;
  }
  return "Iemand";
}
