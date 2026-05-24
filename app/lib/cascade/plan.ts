/**
 * Pure cascade planner. Bridges `decideCascadePhase` + `buildPhaseAudience`
 * into a persistence plan the runner adapter applies blindly to Prisma.
 *
 * Keeping this layer pure means the runner is trivial (load → plan →
 * persist) and all cascade policy stays unit-testable without I/O.
 */

import type { Match, MatchInviteStatus } from "~/types/domain";
import type { AudienceCandidate, AudienceIndex } from "./audience";
import { buildPhaseAudience } from "./audience";
import { decideCascadePhase } from "./decide";
import { createInviteToken } from "./token";
import type { FiringPhase, IdleReason } from "./types";

/** Row to be inserted into `MatchInvitedPlayer` when a phase fires. */
export type NewInviteRow = {
  matchId: string;
  playerRef: string;
  token: string;
  status: MatchInviteStatus;
  cascadePhase: FiringPhase;
  sentAt: Date | null;
  respondedAt: Date | null;
};

export type MatchStateUpdate = {
  currentCascadePhase: 0 | 1 | 2 | 3;
  nextCascadeAt: Date | null;
};

export type CascadePlan =
  | { kind: "idle"; reason: IdleReason }
  | {
      kind: "fire-phase";
      phase: FiringPhase;
      invitesToInsert: NewInviteRow[];
      matchStateUpdate: MatchStateUpdate;
    }
  | { kind: "mark-full"; matchStateUpdate: MatchStateUpdate }
  | { kind: "mark-exhausted"; matchStateUpdate: MatchStateUpdate };

/**
 * Plan a cascade tick for a single match. Returns the rows to insert and the
 * match state update — no side effects. The adapter wraps this in a Prisma
 * transaction.
 */
export function planCascadeTick(
  match: Match,
  candidates: AudienceCandidate[],
  index: AudienceIndex,
  now: Date,
): CascadePlan {
  const decision = decideCascadePhase(match, now);

  switch (decision.kind) {
    case "idle":
      return { kind: "idle", reason: decision.reason };

    case "mark-full":
      return {
        kind: "mark-full",
        matchStateUpdate: {
          currentCascadePhase: match.currentCascadePhase,
          nextCascadeAt: null,
        },
      };

    case "mark-exhausted":
      return {
        kind: "mark-exhausted",
        matchStateUpdate: {
          currentCascadePhase: match.currentCascadePhase,
          nextCascadeAt: null,
        },
      };

    case "fire-phase": {
      const { accepted } = buildPhaseAudience(
        match,
        decision.phase,
        candidates,
        index,
      );

      const invitesToInsert: NewInviteRow[] = accepted.map((user) => ({
        matchId: match.id,
        playerRef: user.phone.replace(/^whatsapp:/, ""),
        token: createInviteToken(),
        status: "pending",
        cascadePhase: decision.phase,
        sentAt: null,
        respondedAt: null,
      }));

      return {
        kind: "fire-phase",
        phase: decision.phase,
        invitesToInsert,
        matchStateUpdate: {
          currentCascadePhase: decision.phase,
          nextCascadeAt: decision.nextAt,
        },
      };
    }
  }
}
