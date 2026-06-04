/**
 * Pure organiser-control planners.
 *
 * Each planner takes a {@link Match} (plus minimal extra args) and `now`, and
 * returns a plain "plan" describing the state mutation + notifications to
 * send. The Prisma adapter (`organiser.server.ts`) applies the plan.
 *
 * No I/O, no clocks beyond the injected `now`.
 */

import { isMatchFull, type Match } from "~/types/domain";
import type { FiringPhase } from "./types";

export type OrganiserNotification = {
  /** playerRef (bare phone) of the recipient — adapter resolves to a User. */
  playerRef: string;
  /** Kind hints the adapter which Dutch template to render. */
  kind: "removed-from-match" | "match-cancelled";
};

/* -------------------------------------------------------------------------- */
/*  Skip phase                                                                */
/* -------------------------------------------------------------------------- */

export type SkipPhasePlan =
  | { kind: "no-op"; reason: SkipPhaseReason }
  | {
      kind: "skip";
      /** New `nextCascadeAt` — always equal to `now` so the next cron tick fires. */
      nextCascadeAt: string;
      /** The phase that will fire on the next tick (purely informational). */
      nextPhase: FiringPhase;
    };

export type SkipPhaseReason =
  | "match-cancelled"
  | "match-full"
  | "no-next-phase"
  | "already-due";

/**
 * Plan the "skip to next phase" organiser control: nudge `nextCascadeAt=now`
 * so the next cron tick fires the next eligible phase. The planner remains
 * the source of truth for which phase actually fires.
 */
export function planSkipPhase(input: {
  match: Match;
  now: Date;
}): SkipPhasePlan {
  const { match, now } = input;

  if (match.status === "cancelled") {
    return { kind: "no-op", reason: "match-cancelled" };
  }
  if (isMatchFull(match)) {
    return { kind: "no-op", reason: "match-full" };
  }

  const next = nextEligiblePhase(match);
  if (next === null) {
    return { kind: "no-op", reason: "no-next-phase" };
  }

  if (
    match.nextCascadeAt &&
    new Date(match.nextCascadeAt).getTime() <= now.getTime()
  ) {
    return { kind: "no-op", reason: "already-due" };
  }

  return {
    kind: "skip",
    nextCascadeAt: now.toISOString(),
    nextPhase: next,
  };
}

function nextEligiblePhase(match: Match): FiringPhase | null {
  const fired = match.currentCascadePhase;
  if (fired < 1) return 1;
  if (fired < 2 && match.fallbackToLevelRange) return 2;
  if (fired < 3 && match.fallbackToEveryone) return 3;
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Remove player                                                             */
/* -------------------------------------------------------------------------- */

export type RemovePlayerPlan =
  | { kind: "no-op"; reason: RemovePlayerReason }
  | {
      kind: "remove";
      /** playerRef whose invite flips to 'declined' (free the slot). */
      playerRef: string;
      /** Where the player was on the court before removal. */
      from: "confirmed-slot" | "accepted-invite";
      /** New value for confirmedSlotNames if `from === "confirmed-slot"`. */
      confirmedSlotNames?: string[];
      /** Notifications to send after the state mutation. */
      notifications: OrganiserNotification[];
      /**
       * After freeing a slot, the cascade may want to resume. We always
       * nudge `nextCascadeAt=now` when a next phase exists so the cron
       * tick re-evaluates. The planner remains the source of truth.
       */
      nextCascadeAt: string | null;
    };

export type RemovePlayerReason =
  | "match-cancelled"
  | "not-found"
  | "not-on-court";

/**
 * Plan removing an accepted player or a confirmed-slot name from a match.
 * Two shapes:
 *  - `playerRef` set: flip MatchInvitedPlayer.status from 'accepted' to
 *    'declined' (a removed-by-organiser flavour). Notify the removed User.
 *  - `confirmedSlotName` set: drop that name from `confirmedSlotNames`. No
 *    notification (those names are non-User / placeholder slots).
 */
export function planRemovePlayer(input: {
  match: Match;
  /** Pass exactly one of these. */
  playerRef?: string;
  confirmedSlotName?: string;
  now: Date;
}): RemovePlayerPlan {
  const { match, playerRef, confirmedSlotName, now } = input;

  if (match.status === "cancelled") {
    return { kind: "no-op", reason: "match-cancelled" };
  }

  if (confirmedSlotName !== undefined) {
    const idx = match.confirmedSlotNames.indexOf(confirmedSlotName);
    if (idx === -1) {
      return { kind: "no-op", reason: "not-found" };
    }
    const next = match.confirmedSlotNames.filter((_, i) => i !== idx);
    return {
      kind: "remove",
      playerRef: "", // unused
      from: "confirmed-slot",
      confirmedSlotNames: next,
      notifications: [],
      nextCascadeAt: computePostRemoveNextAt(match, now),
    };
  }

  if (playerRef !== undefined) {
    const invite = match.invitedPlayers.find((i) => i.playerRef === playerRef);
    if (!invite || invite.status !== "accepted") {
      return { kind: "no-op", reason: "not-on-court" };
    }
    return {
      kind: "remove",
      playerRef,
      from: "accepted-invite",
      notifications: [{ playerRef, kind: "removed-from-match" }],
      nextCascadeAt: computePostRemoveNextAt(match, now),
    };
  }

  return { kind: "no-op", reason: "not-found" };
}

/**
 * After removing a player a slot is now open. If the cascade hasn't reached
 * its terminal phase yet, nudge `nextCascadeAt=now` so the next tick re-fires
 * the audience filter (e.g. resumes phase 2 if it had marked-full earlier).
 *
 * If we're already mid-cascade (phase scheduled in future), leave the existing
 * schedule alone — the freed slot will be picked up at the natural delay.
 */
export function computePostRemoveNextAt(match: Match, now: Date): string | null {
  const next = nextEligiblePhase(match);
  if (next === null) {
    // No more phases to fire. Keep nextCascadeAt as-is (likely null).
    return match.nextCascadeAt;
  }
  // If nothing was scheduled (we'd marked-full earlier), nudge to now so
  // the cascade resumes.
  if (match.nextCascadeAt === null) {
    return now.toISOString();
  }
  // Otherwise keep the existing schedule.
  return match.nextCascadeAt;
}

/* -------------------------------------------------------------------------- */
/*  Add non-User confirmed slot                                               */
/* -------------------------------------------------------------------------- */

export type AddConfirmedSlotPlan =
  | { kind: "no-op"; reason: AddConfirmedSlotReason }
  | {
      kind: "add";
      /** New confirmedSlotNames array to persist. */
      confirmedSlotNames: string[];
    };

export type AddConfirmedSlotReason =
  | "match-cancelled"
  | "match-full"
  | "empty-name"
  | "duplicate-name";

/**
 * Plan adding a non-User name to `confirmedSlotNames`. Used when the
 * organiser knows someone in real life who isn't on PadelMatch yet.
 *
 * The added name occupies an open slot (capacity-checked) but bypasses the
 * invite/accept flow entirely — there is no notification, no token.
 */
export function planAddConfirmedSlot(input: {
  match: Match;
  name: string;
}): AddConfirmedSlotPlan {
  const { match, name } = input;

  if (match.status === "cancelled") {
    return { kind: "no-op", reason: "match-cancelled" };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { kind: "no-op", reason: "empty-name" };
  }
  if (
    match.confirmedSlotNames.some(
      (n) => n.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return { kind: "no-op", reason: "duplicate-name" };
  }
  if (isMatchFull(match)) {
    return { kind: "no-op", reason: "match-full" };
  }

  return {
    kind: "add",
    confirmedSlotNames: [...match.confirmedSlotNames, trimmed],
  };
}

/* -------------------------------------------------------------------------- */
/*  Cancel match                                                              */
/* -------------------------------------------------------------------------- */

export type CancelMatchPlan =
  | { kind: "no-op"; reason: CancelMatchReason }
  | {
      kind: "cancel";
      /** Tokens of invites to expire (pending or accepted). */
      invalidateTokens: string[];
      /** Notify these players that the match is cancelled. */
      notifications: OrganiserNotification[];
    };

export type CancelMatchReason = "already-cancelled";

/**
 * Plan cancelling a match: status → 'cancelled', invalidate all pending +
 * accepted invite tokens, notify everyone who had a live invite.
 */
export function planCancelMatch(input: { match: Match }): CancelMatchPlan {
  const { match } = input;

  if (match.status === "cancelled") {
    return { kind: "no-op", reason: "already-cancelled" };
  }

  const targets = match.invitedPlayers.filter(
    (i) => i.status === "pending" || i.status === "accepted",
  );

  return {
    kind: "cancel",
    invalidateTokens: targets.map((i) => i.token),
    notifications: targets.map<OrganiserNotification>((i) => ({
      playerRef: i.playerRef,
      kind: "match-cancelled",
    })),
  };
}
