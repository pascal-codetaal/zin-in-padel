/**
 * Cascade invite dispatcher.
 *
 * In mock mode: writes outbound Message rows via
 * `sendWhatsAppMessage(userId, body)` and stamps `MatchInvitedPlayer.sentAt`.
 * No Twilio — the dev simulator surfaces the messages as the invitee's
 * inbox so the accept/decline links are reachable end-to-end.
 *
 * In real mode the same functions call Twilio. `sendInviteByToken` is the
 * unit the BullMQ worker invokes per `invite-sends` job; `dispatchPendingInvites`
 * is the synchronous inline path used when the queue is disabled.
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
import { findApprovedWhatsAppTemplate } from "~/lib/whatsapp-templates-db.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import { formatInviteMessage } from "./format";
import { buildInviteContentVariables } from "@whatsapp-templates/invites/variables";
import { INVITE_WHATSAPP_TEMPLATE_ID } from "@whatsapp-templates/registry";
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
  | "match-not-loadable"
  | "invite-not-found"
  | "already-sent";

export type SendInviteOutcome =
  | { kind: "sent" }
  | { kind: "skipped"; reason: SkipReason }
  | { kind: "failed"; error: string };

/**
 * Send one invite by its token. Used by both the inline dispatcher and the
 * BullMQ send worker (so the Twilio call + DB stamping live in one place).
 *
 * Real Twilio mode: throws on Twilio API errors so the worker can NACK and
 * retry. Mock mode never throws because `sendWhatsAppMessage` only writes
 * the Message row.
 */
export async function sendInviteByToken(
  token: string,
  now: Date,
  options: { deliverViaApi?: boolean } = {},
): Promise<SendInviteOutcome> {
  const inviteRow = await prisma.matchInvitedPlayer.findUnique({
    where: { token },
  });
  if (!inviteRow) return { kind: "skipped", reason: "invite-not-found" };
  if (inviteRow.sentAt !== null) return { kind: "skipped", reason: "already-sent" };

  const matchRow = await prisma.match.findUnique({
    where: { id: inviteRow.matchId },
    include: { invitedPlayers: true, confirmedSlots: true, clubs: true },
  });
  if (!matchRow) return { kind: "skipped", reason: "match-not-loadable" };

  const match = matchRowToDomain(matchRow);
  const organiser = await findUserById(match.organizerId);
  if (!organiser) return { kind: "skipped", reason: "match-not-loadable" };

  const clubs =
    match.clubIds.length > 0 ? await getClubsByIds(match.clubIds) : [];
  const clubName =
    clubs.length > 0
      ? clubs.map((c) => c.name).join(" / ")
      : "Onbekende club";

  const invite = match.invitedPlayers.find((i) => i.token === token);
  if (!invite) return { kind: "skipped", reason: "invite-not-found" };

  return dispatchOne({
    match,
    invite,
    organiserFullName: organiser.profileName,
    clubName,
    now,
    deliverViaApi: options.deliverViaApi === true,
  });
}

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
      deliverViaApi: true,
    });
    if (result.kind === "sent") {
      outcome.sent += 1;
    } else if (result.kind === "skipped") {
      outcome.skipped.push({
        playerRef: invite.playerRef,
        reason: result.reason,
      });
    }
    // result.kind === "failed" only happens in deliverViaApi mode (worker).
    // Inline dispatcher never uses it, but keep the type exhaustive.
  }

  return outcome;
}

async function dispatchOne(args: {
  match: Match;
  invite: MatchInvite;
  organiserFullName: string;
  clubName: string;
  now: Date;
  deliverViaApi?: boolean;
}): Promise<SendInviteOutcome> {
  const {
    match,
    invite,
    organiserFullName,
    clubName,
    now,
    deliverViaApi = false,
  } = args;

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
  const phase = invite.cascadePhase as FiringPhase;
  const matchView = {
    clubName,
    whenLabel: formatScheduledAt(match.scheduledAt),
    openSlots: openSlotsOf(match),
    format: match.format,
    fallbackLevelMin: match.fallbackLevelMin,
    fallbackLevelMax: match.fallbackLevelMax,
  };
  const recipient = {
    firstName:
      (player?.name ?? user.profileName).split(/\s+/)[0] ?? user.profileName,
  };
  const organiser = { fullName: organiserFullName };
  const acceptUrl = `${baseUrl}/i/${invite.token}`;
  const declineUrl = `${baseUrl}/i/${invite.token}/nee`;

  const body = formatInviteMessage({
    phase,
    match: matchView,
    recipient,
    organiser,
    acceptUrl,
    declineUrl,
  });

  const templateRow = await findApprovedWhatsAppTemplate(
    INVITE_WHATSAPP_TEMPLATE_ID,
  );
  const contentVariables = templateRow
    ? buildInviteContentVariables({
        match: matchView,
        recipient,
        organiser,
        acceptUrl,
        declineUrl,
      })
    : null;

  try {
    await sendWhatsAppMessage(user.id, body, {
      deliverViaApi,
      twilioTemplate:
        templateRow?.contentSid && contentVariables
          ? {
              contentSid: templateRow.contentSid,
              contentVariables,
            }
          : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.matchInvitedPlayer.update({
      where: { token: invite.token },
      data: {
        sendAttempts: { increment: 1 },
        sendError: message.slice(0, 500),
      },
    });
    return { kind: "failed", error: message };
  }

  await prisma.matchInvitedPlayer.update({
    where: { token: invite.token },
    data: {
      sentAt: now,
      sendAttempts: { increment: 1 },
      sendError: null,
    },
  });

  return { kind: "sent" };
}
