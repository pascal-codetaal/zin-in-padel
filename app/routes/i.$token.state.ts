/**
 * Pure render-state derivation for the invite landing page (`i.$token.tsx`).
 *
 * Kept out of the route module so it can be unit-tested without importing the
 * server-only loader/action dependencies (Prisma, db.server, …).
 *
 * Key invariant: the landing route uses React Router's default revalidation,
 * so after an accept/decline action the loader re-runs and `state` already
 * reflects the new slot counts. The derivation therefore trusts `state` for
 * slot numbers and only layers the action's authoritative reject reason on
 * top — it must NOT re-derive open slots from the action, which is what caused
 * "X/Y ingevuld" to read full until a manual reload.
 */

export type RejectReason =
  | "match-full"
  | "match-cancelled"
  | "match-started"
  | "invite-expired";

export type LoaderState =
  | { kind: "ok"; openSlots: number }
  | { kind: "already-accepted"; openSlots: number }
  | { kind: "declined"; openSlots: number }
  | { kind: "blocked"; reason: RejectReason };

export type AcceptActionData =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; reason: RejectReason };

/**
 * Combine the (revalidated) loader state with the most recent action result.
 *
 * A rejected accept surfaces the explicit FCFS decision reason; every other
 * case — including a successful accept — defers to `state`, which the loader
 * has already revalidated to the correct post-action slot counts.
 */
export function deriveRenderState(
  state: LoaderState,
  actionData: AcceptActionData | undefined,
): LoaderState {
  if (actionData && actionData.ok === false && "reason" in actionData) {
    return { kind: "blocked", reason: actionData.reason };
  }
  return state;
}
