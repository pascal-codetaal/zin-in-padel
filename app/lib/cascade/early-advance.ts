/**
 * Pure helper: should the cascade jump ahead because every invitee in the
 * current phase has already responded (and the match still has open slots)?
 *
 * The actual phase transition still goes through `planCascadeTick` on the
 * next cron tick — this helper only computes the new `nextCascadeAt`. That
 * keeps a single source of truth for cascade transitions.
 */

import type { Match } from "~/types/domain";
import { isMatchFull } from "~/types/domain";

export type EarlyAdvanceDecision =
  | { kind: "no-op"; reason: EarlyAdvanceReason }
  | { kind: "advance"; nextCascadeAt: string };

export type EarlyAdvanceReason =
  | "match-full"
  | "match-cancelled"
  | "no-active-phase"
  | "no-next-phase"
  | "already-due"
  | "still-pending";

export function decideEarlyAdvance(input: {
  match: Match;
  now: Date;
}): EarlyAdvanceDecision {
  const { match, now } = input;

  if (match.status === "cancelled") {
    return { kind: "no-op", reason: "match-cancelled" };
  }
  if (isMatchFull(match)) {
    return { kind: "no-op", reason: "match-full" };
  }
  if (match.currentCascadePhase === 0) {
    return { kind: "no-op", reason: "no-active-phase" };
  }

  // No further phases configured → nothing to early-advance into.
  const hasNextPhase =
    (match.currentCascadePhase === 1 &&
      (match.fallbackToLevelRange || match.fallbackToEveryone)) ||
    (match.currentCascadePhase === 2 && match.fallbackToEveryone);
  if (!hasNextPhase) {
    return { kind: "no-op", reason: "no-next-phase" };
  }

  // Already due — no point bumping it forward, the next cron will pick it up.
  if (
    match.nextCascadeAt &&
    new Date(match.nextCascadeAt).getTime() <= now.getTime()
  ) {
    return { kind: "no-op", reason: "already-due" };
  }

  // Are all current-phase invitees done responding?
  const current = match.invitedPlayers.filter(
    (i) => i.cascadePhase === match.currentCascadePhase,
  );
  if (current.length === 0) {
    // Should not happen in practice (phase fires only with audience), but
    // defend against it: don't early-advance.
    return { kind: "no-op", reason: "still-pending" };
  }
  const anyPending = current.some((i) => i.status === "pending");
  if (anyPending) {
    return { kind: "no-op", reason: "still-pending" };
  }

  return { kind: "advance", nextCascadeAt: now.toISOString() };
}
