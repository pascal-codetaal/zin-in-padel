/**
 * Pure audience builder for cascade phases. Given a phase, a match, and a
 * pool of candidate users (plus a few precomputed indexes), returns the
 * subset that should receive an invite for that phase.
 *
 * No I/O — the adapter provides all lookups via the index parameters.
 * See ADR-0004 and the "Cascade exclusions" section of CONTEXT.md.
 */

import type { Match, User } from "~/types/domain";
import type { FiringPhase } from "./types";

/**
 * Inputs the pure function needs that the adapter precomputes:
 *
 * - `alreadyInvitedRefs`: player refs already in `match.invitedPlayers`
 *   (any status). Pre-derive so we don't iterate match.invitedPlayers
 *   per candidate.
 * - `declinedRefs`: player refs that explicitly declined this match
 *   (subset of `alreadyInvitedRefs`).
 * - `friendRefs`: organiser's `invitedFriendRefs` set as a Set for O(1)
 *   lookup.
 * - `conflictingRefs`: player refs with an `accepted` or `pending` slot
 *   in another match overlapping `match`'s time window.
 */
export type AudienceIndex = {
  alreadyInvitedRefs: Set<string>;
  declinedRefs: Set<string>;
  friendRefs: Set<string>;
  conflictingRefs: Set<string>;
};

export type AudienceExclusionReason =
  | "organiser"
  | "opted-out"
  | "already-invited"
  | "declined-previously"
  | "friends-only-preference"
  | "gender-mismatch"
  | "level-out-of-range"
  | "club-not-preferred"
  | "time-conflict"
  | "not-on-friend-list";

export type AudienceCandidate = {
  user: User;
  /** Phone-equivalent ref used to look up invites etc. */
  ref: string;
};

export type AudienceResult = {
  accepted: User[];
  rejected: { user: User; reason: AudienceExclusionReason }[];
};

/**
 * Filter `candidates` to the subset eligible to receive an invite for
 * `phase` on `match`.
 *
 * Universal exclusions (all phases): organiser, opted-out, already
 * invited, declined previously. Phase 1 additionally requires
 * membership in the organiser's friend list. Phase 2/3 additionally
 * apply: matchPreference, gender, club preference, time conflict, and
 * (phase 2 only) the configured level range.
 */
export function buildPhaseAudience(
  match: Match,
  phase: FiringPhase,
  candidates: AudienceCandidate[],
  index: AudienceIndex,
): AudienceResult {
  const accepted: User[] = [];
  const rejected: AudienceResult["rejected"] = [];

  for (const { user, ref } of candidates) {
    const reason = excludeReason(match, phase, user, ref, index);
    if (reason) {
      rejected.push({ user, reason });
    } else {
      accepted.push(user);
    }
  }

  return { accepted, rejected };
}

/**
 * Return the exclusion reason for `user`, or null if they should
 * receive an invite. Exposed for tests.
 */
export function excludeReason(
  match: Match,
  phase: FiringPhase,
  user: User,
  ref: string,
  index: AudienceIndex,
): AudienceExclusionReason | null {
  // Universal (all phases).
  if (user.id === match.organizerId) return "organiser";
  if (!user.optedIn) return "opted-out";
  if (index.alreadyInvitedRefs.has(ref)) return "already-invited";
  if (index.declinedRefs.has(ref)) return "declined-previously";

  if (phase === 1) {
    if (!index.friendRefs.has(ref)) return "not-on-friend-list";
    return null;
  }

  // Phases 2 + 3 exclusions.
  if (user.matchPreference === "friends_only") {
    return "friends-only-preference";
  }
  if (!genderMatchesFormat(user.gender, match.format)) {
    return "gender-mismatch";
  }
  if (match.clubId && !user.preferredClubIds.includes(match.clubId)) {
    return "club-not-preferred";
  }
  if (index.conflictingRefs.has(ref)) {
    return "time-conflict";
  }

  // Phase 2 only — level range.
  if (phase === 2) {
    if (!levelInRange(user.level, match.fallbackLevelMin, match.fallbackLevelMax)) {
      return "level-out-of-range";
    }
  }

  return null;
}

function genderMatchesFormat(
  gender: User["gender"],
  format: Match["format"],
): boolean {
  if (format === "mixed") return true;
  if (format === "men_only") return gender === "m";
  if (format === "women_only") return gender === "w";
  return true;
}

function levelInRange(
  level: User["level"],
  min: Match["fallbackLevelMin"],
  max: Match["fallbackLevelMax"],
): boolean {
  // Phase 2 invariant (per CONTEXT.md): if fallbackToLevelRange=true the
  // organiser was forced to set min/max. A null min/max here means the
  // invariant was violated upstream; conservatively exclude unknowns.
  if (min === null || max === null) return false;
  if (level === null) return false;
  return level >= min && level <= max;
}
