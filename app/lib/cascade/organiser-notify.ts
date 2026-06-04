/**
 * Pure helper deciding which organiser-bound WhatsApp notifications should
 * fire as a result of an invite-response or a cascade-runner outcome.
 *
 * The organiser hears about:
 *   - each accept (acknowledge that {firstName} is on the court)
 *   - the match filling up (cascade auto-stops)
 *   - the cascade running out of phases while slots remain (organiser
 *     decision needed: extend / cancel)
 *
 * Decline + phase-fire events stay in-app only — see locked decision in
 * CONTEXT.md ("Organiser declines + phase-send events live in match
 * detail page only").
 *
 * No I/O, no clock beyond the injected `now`.
 */

import { isMatchFull, openSlotsOf, type Match } from "~/types/domain";

export type OrganiserNotice =
  | { kind: "invitee-accepted"; playerRef: string }
  | { kind: "invitee-left"; playerRef: string }
  | { kind: "match-full" }
  | { kind: "cascade-exhausted"; openSlots: number };

/** Result of evaluating an invite-response against the new match state. */
export function decideAcceptNotices(input: {
  /** Match state *before* the accept landed. */
  prev: Match;
  /** Match state *after* the accept landed. */
  next: Match;
  /** playerRef whose accept produced `next`. */
  acceptedPlayerRef: string;
}): OrganiserNotice[] {
  const { prev, next, acceptedPlayerRef } = input;
  // Guard: only emit notices on a real accept transition. Caller already
  // filters, but cheap to double-check.
  const wasFull = isMatchFull(prev);
  const isFull = isMatchFull(next);

  const out: OrganiserNotice[] = [];
  if (!wasFull) {
    out.push({ kind: "invitee-accepted", playerRef: acceptedPlayerRef });
    if (isFull) out.push({ kind: "match-full" });
  }
  return out;
}

/** Result of evaluating a cron-tick outcome for organiser notifications. */
export function decideRunnerNotices(input: {
  match: Match;
  planKind: "mark-full" | "mark-exhausted" | "fire-phase" | "idle";
}): OrganiserNotice[] {
  const { match, planKind } = input;
  if (planKind === "mark-full") {
    return [{ kind: "match-full" }];
  }
  if (planKind === "mark-exhausted") {
    const open = openSlotsOf(match);
    if (open > 0) {
      return [{ kind: "cascade-exhausted", openSlots: open }];
    }
  }
  return [];
}
