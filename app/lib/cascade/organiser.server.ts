/**
 * Organiser-controls adapter — applies the pure plans from `organiser.ts` to
 * Prisma + sends post-action notifications via the existing
 * {@link sendWhatsAppMessage} mock-send path (Phase E.0).
 *
 * Each control loads the match under a row-level lock so it can't race with
 * accept/decline or the cron tick.
 */

import { prisma } from "~/lib/prisma.server";
import {
  findPlayerByRef,
  findUserByPhone,
  matchRowToDomain,
} from "~/lib/db.server";
import { sendWhatsAppMessage } from "~/lib/whatsapp-messaging.server";
import { getClubsByIds } from "~/lib/clubs.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import { isMatchFull, type Match } from "~/types/domain";
import {
  planAddConfirmedSlot,
  planCancelMatch,
  planRemovePlayer,
  planSkipPhase,
  type AddConfirmedSlotPlan,
  type CancelMatchPlan,
  type OrganiserNotification,
  type RemovePlayerPlan,
  type SkipPhasePlan,
} from "./organiser";
import { decideRunnerNotices } from "./organiser-notify";
import { notifyOrganiser } from "./organiser-notify.server";
import { archiveInviteSendsForMatch } from "./queue.server";

const MATCH_INCLUDE = {
  invitedPlayers: true,
  confirmedSlots: true,
  clubs: true,
} as const;

export type SkipPhaseResult = {
  plan: SkipPhasePlan;
  match: Match;
};

export type RemovePlayerResult = {
  plan: RemovePlayerPlan;
  match: Match;
};

export type CancelMatchResult = {
  plan: CancelMatchPlan;
  match: Match;
  notificationsSent: number;
  queuedSendsArchived: number;
};

/* -------------------------------------------------------------------------- */
/*  Skip phase                                                                */
/* -------------------------------------------------------------------------- */

export async function skipCascadePhase(input: {
  matchId: string;
  now: Date;
}): Promise<SkipPhaseResult | null> {
  const { matchId, now } = input;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
    const row = await tx.match.findUnique({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    if (!row) return null;
    const match = matchRowToDomain(row);

    const plan = planSkipPhase({ match, now });
    if (plan.kind === "skip") {
      const updated = await tx.match.update({
        where: { id: matchId },
        data: {
          nextCascadeAt: new Date(plan.nextCascadeAt),
          updatedAt: now,
        },
        include: MATCH_INCLUDE,
      });
      return { plan, match: matchRowToDomain(updated) };
    }
    return { plan, match };
  });
}

/* -------------------------------------------------------------------------- */
/*  Remove player                                                             */
/* -------------------------------------------------------------------------- */

export async function removePlayerFromMatch(input: {
  matchId: string;
  /** Provide exactly one of these. */
  playerRef?: string;
  confirmedSlotName?: string;
  now: Date;
}): Promise<RemovePlayerResult | null> {
  const { matchId, playerRef, confirmedSlotName, now } = input;

  // Apply state mutation in a transaction, then send notifications outside it
  // so a Twilio/mock-send blip doesn't roll back the removal.
  const txResult = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
    const row = await tx.match.findUnique({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    if (!row) return null;
    const match = matchRowToDomain(row);

    const plan = planRemovePlayer({
      match,
      playerRef,
      confirmedSlotName,
      now,
    });
    if (plan.kind !== "remove") {
      return { plan, match };
    }

    if (plan.from === "accepted-invite") {
      await tx.matchInvitedPlayer.updateMany({
        where: { matchId, playerRef: plan.playerRef, status: "accepted" },
        data: { status: "declined", respondedAt: now },
      });
    } else if (plan.from === "confirmed-slot" && plan.confirmedSlotNames) {
      await tx.matchConfirmedSlot.deleteMany({ where: { matchId } });
      for (let i = 0; i < plan.confirmedSlotNames.length; i++) {
        await tx.matchConfirmedSlot.create({
          data: { matchId, idx: i, name: plan.confirmedSlotNames[i]! },
        });
      }
    }

    await tx.match.update({
      where: { id: matchId },
      data: {
        nextCascadeAt: plan.nextCascadeAt
          ? new Date(plan.nextCascadeAt)
          : null,
        updatedAt: now,
      },
    });

    const fresh = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    return { plan, match: matchRowToDomain(fresh) };
  });

  if (!txResult) return null;
  if (txResult.plan.kind !== "remove") return txResult as RemovePlayerResult;

  // Send notifications post-commit.
  for (const note of txResult.plan.notifications) {
    await sendOrganiserNotification(note, txResult.match);
  }
  return txResult as RemovePlayerResult;
}

/* -------------------------------------------------------------------------- */
/*  Add non-User confirmed slot                                               */
/* -------------------------------------------------------------------------- */

export type AddConfirmedSlotResult = {
  plan: AddConfirmedSlotPlan;
  match: Match;
};

export async function addConfirmedSlotToMatch(input: {
  matchId: string;
  name: string;
  now: Date;
}): Promise<AddConfirmedSlotResult | null> {
  const { matchId, name, now } = input;

  const txResult = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
    const row = await tx.match.findUnique({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    if (!row) return null;
    const prev = matchRowToDomain(row);

    const plan = planAddConfirmedSlot({ match: prev, name });
    if (plan.kind !== "add") {
      return { plan, match: prev, prev };
    }

    await tx.matchConfirmedSlot.deleteMany({ where: { matchId } });
    for (let i = 0; i < plan.confirmedSlotNames.length; i++) {
      await tx.matchConfirmedSlot.create({
        data: { matchId, idx: i, name: plan.confirmedSlotNames[i]! },
      });
    }

    // If this add tipped the match to full, stop the cascade immediately so
    // the next cron tick doesn't fire another phase. Same end-state the
    // runner would converge to on its own.
    const freshAfter = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    const next = matchRowToDomain(freshAfter);
    const tippedFull = !isMatchFull(prev) && isMatchFull(next);

    await tx.match.update({
      where: { id: matchId },
      data: {
        updatedAt: now,
        ...(tippedFull ? { nextCascadeAt: null } : {}),
      },
    });

    const final = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    return { plan, match: matchRowToDomain(final), prev };
  });

  if (!txResult) return null;
  const { plan, match, prev } = txResult;
  if (plan.kind === "add" && !isMatchFull(prev) && isMatchFull(match)) {
    const notices = decideRunnerNotices({ match, planKind: "mark-full" });
    if (notices.length > 0) {
      await notifyOrganiser({ match, notices });
    }
  }
  return { plan, match };
}

/* -------------------------------------------------------------------------- */
/*  Cancel match                                                              */
/* -------------------------------------------------------------------------- */

export async function cancelMatchAsOrganiser(input: {
  matchId: string;
  now: Date;
}): Promise<CancelMatchResult | null> {
  const { matchId, now } = input;

  const txResult = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
    const row = await tx.match.findUnique({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    if (!row) return null;
    const match = matchRowToDomain(row);

    const plan = planCancelMatch({ match });
    if (plan.kind !== "cancel") {
      return { plan, match };
    }

    // Expire live invites so token lookups (`/i/{token}`) refuse them.
    if (plan.invalidateTokens.length > 0) {
      await tx.matchInvitedPlayer.updateMany({
        where: { token: { in: plan.invalidateTokens } },
        data: { status: "expired", respondedAt: now },
      });
    }

    await tx.match.update({
      where: { id: matchId },
      data: {
        status: "cancelled",
        nextCascadeAt: null,
        updatedAt: now,
      },
    });

    // Drain any queued sends for this match so the worker stops dispatching
    // invites after cancel. No-op when pgmq isn't enabled.
    const archived = await archiveInviteSendsForMatch(matchId).catch(() => 0);

    const fresh = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    return { plan, match: matchRowToDomain(fresh), archived };
  });

  if (!txResult) return null;
  if (txResult.plan.kind !== "cancel") {
    return {
      ...txResult,
      notificationsSent: 0,
      queuedSendsArchived: txResult.archived,
    } as CancelMatchResult;
  }

  let sent = 0;
  for (const note of txResult.plan.notifications) {
    const ok = await sendOrganiserNotification(note, txResult.match);
    if (ok) sent += 1;
  }
  return {
    ...txResult,
    notificationsSent: sent,
    queuedSendsArchived: txResult.archived,
  } as CancelMatchResult;
}

/* -------------------------------------------------------------------------- */
/*  Notification sender                                                       */
/* -------------------------------------------------------------------------- */

async function sendOrganiserNotification(
  note: OrganiserNotification,
  match: Match,
): Promise<boolean> {
  const player = await findPlayerByRef(note.playerRef);
  const phone = player?.phone ?? note.playerRef;
  const user = await findUserByPhone(phone);
  if (!user || !user.optedIn) return false;

  const body = await renderNotification(note, match, player?.name);
  await sendWhatsAppMessage(user.id, body);
  return true;
}

async function renderNotification(
  note: OrganiserNotification,
  match: Match,
  playerName: string | undefined,
): Promise<string> {
  const clubs =
    match.clubIds.length > 0 ? await getClubsByIds(match.clubIds) : [];
  const clubName =
    clubs.length > 0
      ? clubs.map((c) => c.name).join(" / ")
      : "de match";
  const when = formatScheduledAt(match.scheduledAt);
  const greeting = playerName ? `Hey ${playerName.split(/\s+/)[0]}` : "Hey";

  switch (note.kind) {
    case "removed-from-match":
      return [
        `${greeting},`,
        ``,
        `De organisator heeft je uit de padelmatch bij ${clubName} (${when}) gehaald. Je hoeft niet meer te komen.`,
        ``,
        `Reply STOP om geen berichten meer te ontvangen.`,
      ].join("\n");
    case "match-cancelled":
      return [
        `${greeting},`,
        ``,
        `De padelmatch bij ${clubName} (${when}) is geannuleerd door de organisator.`,
        ``,
        `Reply STOP om geen berichten meer te ontvangen.`,
      ].join("\n");
  }
}
