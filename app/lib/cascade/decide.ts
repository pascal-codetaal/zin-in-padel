/**
 * Pure decision function for what the cascade tick should do for a single
 * match. No I/O, no clocks — `now` is injected. See ADR-0004.
 */

import { isMatchFull, type Match } from "~/types/domain";
import type { CascadeDecision, FiringPhase } from "./types";

/**
 * Decide what to do with `match` at instant `now`.
 *
 * Algorithm:
 * 1. If match is cancelled or has no scheduledAt, idle.
 * 2. If `now` is past `scheduledAt`, idle (too late to invite anyone).
 * 3. If match is full, mark-full (sender of decision persists state +
 *    triggers organiser notification on first transition).
 * 4. If current phase has been fired and `nextCascadeAt` is in the future,
 *    idle (not yet due).
 * 5. Otherwise the next eligible phase needs to fire:
 *    - phase 1 always fires once.
 *    - phase 2 fires only if `fallbackToLevelRange`.
 *    - phase 3 fires only if `fallbackToEveryone`.
 *    - Skip phases whose flag is off.
 *    - If no phase remains and the match still isn't full → mark-exhausted.
 */
export function decideCascadePhase(
  match: Match,
  now: Date,
): CascadeDecision {
  if (match.status === "cancelled") {
    return { kind: "idle", reason: "cancelled" };
  }

  if (!match.scheduledAt) {
    return { kind: "idle", reason: "no-scheduled-at" };
  }

  const startsAt = new Date(match.scheduledAt);
  if (now.getTime() >= startsAt.getTime()) {
    return { kind: "idle", reason: "past-starts-at" };
  }

  if (isMatchFull(match)) {
    return { kind: "mark-full" };
  }

  // Not due yet — `nextCascadeAt` set in the future.
  if (match.nextCascadeAt) {
    const dueAt = new Date(match.nextCascadeAt);
    if (now.getTime() < dueAt.getTime()) {
      return { kind: "idle", reason: "not-yet-due" };
    }
  }

  const nextPhase = nextEligiblePhase(match);
  if (nextPhase === null) {
    return { kind: "mark-exhausted" };
  }

  return {
    kind: "fire-phase",
    phase: nextPhase,
    nextAt: computeNextAt(match, nextPhase, now),
  };
}

/**
 * Return the next phase to fire (1, 2, or 3), or null if every eligible
 * phase has already fired.
 */
function nextEligiblePhase(match: Match): FiringPhase | null {
  const fired = match.currentCascadePhase;

  if (fired < 1) return 1;
  if (fired < 2 && match.fallbackToLevelRange) return 2;
  if (fired < 3 && match.fallbackToEveryone) {
    // Phase 2 may have been skipped (flag off). Allow jumping straight to 3.
    return 3;
  }
  return null;
}

/**
 * Given that `phase` is about to fire at `now`, what is the next
 * `nextCascadeAt` value? Returns null when there are no more phases left.
 */
function computeNextAt(
  match: Match,
  phase: FiringPhase,
  now: Date,
): Date | null {
  // After phase 1, schedule phase 2 (if enabled) or phase 3 (if 2 disabled
  // but 3 enabled).
  if (phase === 1) {
    if (match.fallbackToLevelRange) {
      return addMinutes(now, match.fallbackLevelDelayMinutes);
    }
    if (match.fallbackToEveryone) {
      // Phase 2 is skipped — phase 3 still measured from match creation
      // (== "now" at phase 1 fire). Same offset semantics.
      return addMinutes(now, match.fallbackEveryoneDelayMinutes);
    }
    return null;
  }

  // After phase 2, schedule phase 3 (if enabled). The delay is measured
  // from phase 2's fire time, not from match creation, so the gap between
  // phases is predictable.
  if (phase === 2) {
    if (match.fallbackToEveryone) {
      return addMinutes(now, match.fallbackEveryoneDelayMinutes);
    }
    return null;
  }

  // Phase 3 is terminal.
  return null;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}
