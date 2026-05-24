/**
 * Cascade pure-core types. Plain data — no Prisma, no Date sources, no I/O.
 * See docs/adr/0004-pure-function-cascade-core.md.
 */

/** Cascade phases. 0 = not yet started; 1/2/3 = last phase fired. */
export type CascadePhase = 0 | 1 | 2 | 3;
export type FiringPhase = 1 | 2 | 3;

/**
 * Decision returned by `decideCascadePhase`. Discriminated by `kind`:
 *
 * - `idle`            — nothing to do; do not touch state.
 * - `fire-phase`      — fire the given phase and persist `nextAt` as the
 *                       new `nextCascadeAt` (null = cascade complete after
 *                       this phase).
 * - `mark-full`       — match has filled; set `nextCascadeAt=null` and
 *                       record the transition (organiser notification).
 * - `mark-exhausted`  — no further phases configured and the match is
 *                       still not full; set `nextCascadeAt=null` and
 *                       notify the organiser.
 */
export type CascadeDecision =
  | { kind: "idle"; reason: IdleReason }
  | { kind: "fire-phase"; phase: FiringPhase; nextAt: Date | null }
  | { kind: "mark-full" }
  | { kind: "mark-exhausted" };

export type IdleReason =
  | "cancelled"
  | "past-starts-at"
  | "not-yet-due"
  | "no-scheduled-at";
