/**
 * Pure helper for the cascade state a freshly-finalised Match should carry.
 *
 * Phase 1 invite rows are already written at draft time (by the draft writer
 * in `db.server.ts` — each new `invitedFriendRef` gets a `MatchInvitedPlayer`
 * row with `cascadePhase=1`, `status='pending'`, `sentAt=null` and a token).
 *
 * So at finalize time the only thing left for phase 1 is to:
 *   1. Mark phase 1 as the "current" (last-fired) phase.
 *   2. Schedule when the cascade tick should next consider this match
 *      (phase 2 time, or phase 3 time if phase 2 is disabled, or null).
 *
 * The actual Twilio send of the phase 1 invites is the queue worker's job
 * (Phase E) — it picks up rows where `sentAt IS NULL` and dispatches them.
 */

import type { Match } from "~/types/domain";
import { decideCascadePhase } from "./decide";

export type InitialCascadeState = {
  currentCascadePhase: 1;
  nextCascadeAt: Date | null;
};

/**
 * Compute the cascade state to write onto a Match the moment it transitions
 * from `draft` → `open`. `now` is the finalisation instant.
 *
 * Uses `decideCascadePhase` with the just-finalised match (which still has
 * `currentCascadePhase=0`) to reuse the same scheduling logic the runner uses.
 */
export function computeInitialCascadeState(
  match: Match,
  now: Date,
): InitialCascadeState {
  // Force the "freshly finalised" shape so we always get the phase-1 decision,
  // regardless of what currentCascadePhase the draft happens to carry.
  const draftShape: Match = {
    ...match,
    currentCascadePhase: 0,
    nextCascadeAt: null,
  };
  const decision = decideCascadePhase(draftShape, now);

  if (decision.kind !== "fire-phase" || decision.phase !== 1) {
    // Defensive: a finalised, in-the-future, not-yet-full match should always
    // produce "fire phase 1". If it doesn't, leave the cascade dormant rather
    // than guess.
    return { currentCascadePhase: 1, nextCascadeAt: null };
  }

  return {
    currentCascadePhase: 1,
    nextCascadeAt: decision.nextAt,
  };
}
