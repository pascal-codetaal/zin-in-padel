/**
 * Accept / decline adapter — wraps {@link decideInviteResponse} in a Prisma
 * transaction with a row-level lock on the Match row so concurrent last-slot
 * accepts can't both win (FCFS guarantee).
 *
 * The pure decision lives in `respond.ts`; this file is the I/O.
 */

import { prisma } from "~/lib/prisma.server";
import {
  matchRowToDomain,
  userRowToDomain,
  findUserByPhone,
} from "~/lib/db.server";
import type { Match, MatchInvite, User } from "~/types/domain";
import {
  decideInviteResponse,
  type InviteResponseAction,
  type InviteResponseDecision,
} from "./respond";
import { decideEarlyAdvance } from "./early-advance";
import { decideAcceptNotices } from "./organiser-notify";
import { notifyOrganiser } from "./organiser-notify.server";

const MATCH_INCLUDE = {
  invitedPlayers: true,
  confirmedSlots: true,
  clubs: true,
} as const;

export type InviteLookup = {
  match: Match;
  invite: MatchInvite;
  /** The User behind the invite, if their phone matches a known User. */
  invitee: User | null;
  organiser: User;
};

/** Look up everything a landing page needs by `token`. */
export async function findInviteByToken(
  token: string,
): Promise<InviteLookup | null> {
  const row = await prisma.matchInvitedPlayer.findUnique({
    where: { token },
    include: {
      match: { include: MATCH_INCLUDE },
      player: true,
    },
  });
  if (!row) return null;

  const match = matchRowToDomain(row.match);
  const invite =
    match.invitedPlayers.find((i) => i.token === token) ?? null;
  if (!invite) return null;

  const organiserRow = await prisma.user.findUnique({
    where: { id: match.organizerId },
    include: { favorites: true, preferredClubs: true },
  });
  if (!organiserRow) return null;

  const invitee = await findUserByPhone(row.player.phone);

  return {
    match,
    invite,
    invitee: invitee ?? null,
    organiser: userRowToDomain(organiserRow),
  };
}

export type RespondResult = {
  decision: InviteResponseDecision;
  /** Match domain object reflecting the post-action state. */
  match: Match;
  invite: MatchInvite;
};

/**
 * Apply an accept or decline. Uses a transaction with `SELECT … FOR UPDATE`
 * on the Match row to serialise concurrent attempts on the last open slot.
 */
export async function respondToInvite(input: {
  token: string;
  action: InviteResponseAction;
  now: Date;
}): Promise<RespondResult | null> {
  const { token, action, now } = input;

  const txResult = await prisma.$transaction(async (tx) => {
    const inviteRow = await tx.matchInvitedPlayer.findUnique({
      where: { token },
    });
    if (!inviteRow) return null;

    // Row-level lock on the Match — blocks other accept-actions from
    // computing isMatchFull off stale data.
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${inviteRow.matchId} FOR UPDATE`;

    const matchRow = await tx.match.findUnique({
      where: { id: inviteRow.matchId },
      include: MATCH_INCLUDE,
    });
    if (!matchRow) return null;
    const match = matchRowToDomain(matchRow);

    const invite =
      match.invitedPlayers.find((i) => i.token === token) ?? null;
    if (!invite) return null;

    const decision = decideInviteResponse({
      match,
      inviteStatus: invite.status,
      action,
      now,
    });

    if (decision.kind === "apply") {
      await tx.matchInvitedPlayer.update({
        where: { token },
        data: {
          status: decision.newStatus,
          respondedAt: now,
        },
      });
      // Re-read match for early-advance decision + caller UI.
      const fresh = await tx.match.findUnique({
        where: { id: inviteRow.matchId },
        include: MATCH_INCLUDE,
      });
      if (!fresh) return null;
      const updatedMatch = matchRowToDomain(fresh);

      // Phase D.5: if every invitee in the current phase has now responded
      // and the match still has open slots, bump nextCascadeAt so the next
      // cron tick advances the cascade immediately instead of waiting out
      // the delay. The planner remains the single source of truth for the
      // actual transition.
      const advance = decideEarlyAdvance({ match: updatedMatch, now });
      if (advance.kind === "advance") {
        await tx.match.update({
          where: { id: inviteRow.matchId },
          data: { nextCascadeAt: new Date(advance.nextCascadeAt) },
        });
        updatedMatch.nextCascadeAt = advance.nextCascadeAt;
      }

      const updatedInvite =
        updatedMatch.invitedPlayers.find((i) => i.token === token) ?? invite;
      return {
        decision,
        match: updatedMatch,
        invite: updatedInvite,
        prev: match,
      };
    }

    return { decision, match, invite, prev: match };
  });

  if (!txResult) return null;

  // Side-effect: organiser notification on a successful accept. Fired
  // outside the transaction so a slow Twilio call can't hold the row lock.
  if (
    txResult.decision.kind === "apply" &&
    txResult.decision.newStatus === "accepted"
  ) {
    const notices = decideAcceptNotices({
      prev: txResult.prev,
      next: txResult.match,
      acceptedPlayerRef: txResult.invite.playerRef,
    });
    if (notices.length > 0) {
      await notifyOrganiser({ match: txResult.match, notices });
    }
  }

  return {
    decision: txResult.decision,
    match: txResult.match,
    invite: txResult.invite,
  };
}
