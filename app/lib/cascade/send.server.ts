/**
 * Cascade invite dispatcher.
 *
 * Phase E.0 (mock mode): writes outbound Message rows via
 * `sendWhatsAppMessage(userId, body)` and stamps `MatchInvitedPlayer.sentAt`.
 * No Twilio, no pgmq — the dev simulator surfaces the messages as the
 * invitee's inbox so the accept/decline links are reachable end-to-end.
 *
 * Phase E will swap the mock branch for an enqueue into pgmq; this file's
 * contract (dispatch all pending invites for a match) stays the same.
 *
 * Non-User favourites and opted-out Users are silently skipped per the
 * "deliverable invitee set" rule in CONTEXT.md. Their MatchInvitedPlayer
 * row stays at `sentAt = null` and is surfaced to the organiser in the
 * match detail UI.
 */

import { prisma } from "~/lib/prisma.server";
import {
  findPlayerByRef,
  findUserByPhone,
  findUserById,
  matchRowToDomain,
} from "~/lib/db.server";
import { getClubsByIds } from "~/lib/clubs.server";
import { sendWhatsAppMessage } from "~/lib/whatsapp-messaging.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import { formatInviteMessage } from "./format";
import { openSlotsOf, type Match, type MatchInvite } from "~/types/domain";
import type { FiringPhase } from "./types";

function getBaseUrl(): string {
  return (
    process.env.BASE_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export type DispatchOutcome = {
  matchId: string;
  attempted: number;
  sent: number;
  skipped: Array<{ playerRef: string; reason: SkipReason }>;
};

export type SkipReason =
  | "no-user-for-phone"
  | "user-opted-out"
  | "match-not-loadable";

/**
 * Send every pending invite for `matchId` that has no `sentAt` yet.
 * Idempotent: a row that already has `sentAt` is left alone.
 */
export async function dispatchPendingInvites(
  matchId: string,
  now: Date,
): Promise<DispatchOutcome> {
  const matchRow = await prisma.match.findUnique({
    where: { id: matchId },
    include: { invitedPlayers: true, confirmedSlots: true, clubs: true },
  });
  if (!matchRow) {
    return { matchId, attempted: 0, sent: 0, skipped: [] };
  }
  const match = matchRowToDomain(matchRow);
  const organiser = await findUserById(match.organizerId);
  if (!organiser) {
    return { matchId, attempted: 0, sent: 0, skipped: [] };
  }
  const clubs =
    match.clubIds.length > 0 ? await getClubsByIds(match.clubIds) : [];
  const clubName =
    clubs.length > 0
      ? clubs.map((c) => c.name).join(" / ")
      : "Onbekende club";

  const pending = match.invitedPlayers.filter(
    (i) => i.sentAt === null && i.status === "pending",
  );

  const outcome: DispatchOutcome = {
    matchId,
    attempted: pending.length,
    sent: 0,
    skipped: [],
  };

  for (const invite of pending) {
    const result = await dispatchOne({
      match,
      invite,
      organiserFullName: organiser.profileName,
      clubName,
      now,
    });
    if (result.kind === "sent") {
      outcome.sent += 1;
    } else {
      outcome.skipped.push({
        playerRef: invite.playerRef,
        reason: result.reason,
      });
    }
  }

  return outcome;
}

async function dispatchOne(args: {
  match: Match;
  invite: MatchInvite;
  organiserFullName: string;
  clubName: string;
  now: Date;
}): Promise<
  | { kind: "sent" }
  | { kind: "skipped"; reason: SkipReason }
> {
  const { match, invite, organiserFullName, clubName, now } = args;

  const player = await findPlayerByRef(invite.playerRef);
  const phone = player?.phone ?? invite.playerRef;
  const user = await findUserByPhone(phone);

  if (!user) {
    return { kind: "skipped", reason: "no-user-for-phone" };
  }
  if (!user.optedIn) {
    return { kind: "skipped", reason: "user-opted-out" };
  }

  const baseUrl = getBaseUrl();
  const body = formatInviteMessage({
    phase: invite.cascadePhase as FiringPhase,
    match: {
      clubName,
      whenLabel: formatScheduledAt(match.scheduledAt),
      openSlots: openSlotsOf(match),
      format: match.format,
      fallbackLevelMin: match.fallbackLevelMin,
      fallbackLevelMax: match.fallbackLevelMax,
    },
    recipient: {
      firstName:
        (player?.name ?? user.profileName).split(/\s+/)[0] ??
        user.profileName,
    },
    organiser: { fullName: organiserFullName },
    acceptUrl: `${baseUrl}/i/${invite.token}`,
    declineUrl: `${baseUrl}/i/${invite.token}/nee`,
  });

  await sendWhatsAppMessage(user.id, body);
  await prisma.matchInvitedPlayer.update({
    where: { token: invite.token },
    data: { sentAt: now },
  });

  return { kind: "sent" };
}
