/**
 * Pure openability decision for the Match opening transition (draft → open).
 *
 * Consumed by `openMatch` in ./open-match.server.ts — the single home for
 * the kickoff sequence (finalize, dispatch phase-1 Match Invites, schedule
 * fallback phase events). Both the wizard's bevestigen step and the
 * matchCreator agent tool cross that seam.
 */

import type { Match } from "~/types/domain";

export type MatchOpenability =
  | { kind: "openable" }
  /** Status is open/confirmed/full — the Match is already live. */
  | { kind: "already-open" }
  | {
      kind: "not-openable";
      reason: "missing-schedule" | "missing-club" | "cancelled";
    };

export function decideMatchOpenability(match: Match): MatchOpenability {
  if (match.status === "cancelled") {
    return { kind: "not-openable", reason: "cancelled" };
  }
  if (match.status !== "draft") {
    return { kind: "already-open" };
  }
  if (!match.scheduledAt) {
    return { kind: "not-openable", reason: "missing-schedule" };
  }
  if (match.clubIds.length === 0) {
    return { kind: "not-openable", reason: "missing-club" };
  }
  return { kind: "openable" };
}
