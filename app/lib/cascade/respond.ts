/**
 * Pure decision helper for what should happen when an invitee taps the
 * accept / decline link. Kept separate from the DB adapter (`respond.server.ts`)
 * so the branching can be exhaustively unit-tested without Prisma.
 *
 * The adapter wraps `decideInviteResponse` inside a transactional
 * `SELECT … FOR UPDATE` on the Match row so two concurrent last-slot
 * accepts cannot both win (FCFS guarantee).
 */

import type { Match, MatchInviteStatus } from "~/types/domain";
import { isMatchFull } from "~/types/domain";

export type InviteResponseAction = "accept" | "decline";

export type InviteResponseDecision =
  /** Status was already what the user is asking for — no DB write needed. */
  | { kind: "idempotent"; status: MatchInviteStatus }
  /** Apply the response: flip status, set respondedAt. */
  | {
      kind: "apply";
      newStatus: "accepted" | "declined";
    }
  /** Cannot fulfil — show the matching reason on the landing page. */
  | {
      kind: "reject";
      reason:
        | "match-full"
        | "match-cancelled"
        | "match-started"
        | "invite-expired";
    };

export function decideInviteResponse(input: {
  match: Match;
  inviteStatus: MatchInviteStatus;
  action: InviteResponseAction;
  now: Date;
}): InviteResponseDecision {
  const { match, inviteStatus, action, now } = input;

  // Cancelled match → never act, regardless of intent.
  if (match.status === "cancelled") {
    return { kind: "reject", reason: "match-cancelled" };
  }

  // Past start time → tokens lapse.
  if (match.scheduledAt && new Date(match.scheduledAt).getTime() <= now.getTime()) {
    return { kind: "reject", reason: "match-started" };
  }

  if (inviteStatus === "expired") {
    return { kind: "reject", reason: "invite-expired" };
  }

  // Idempotent: tapping accept again after accepting (or decline-again).
  if (
    (action === "accept" && inviteStatus === "accepted") ||
    (action === "decline" && inviteStatus === "declined")
  ) {
    return { kind: "idempotent", status: inviteStatus };
  }

  if (action === "decline") {
    // Decline is always allowed (even when match is full — invitee is just
    // letting the organiser know they can't make it). Idempotent above
    // handles double-tap.
    return { kind: "apply", newStatus: "declined" };
  }

  // action === "accept"
  if (isMatchFull(match)) {
    return { kind: "reject", reason: "match-full" };
  }

  return { kind: "apply", newStatus: "accepted" };
}
