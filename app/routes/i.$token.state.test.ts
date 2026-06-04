import { describe, expect, it } from "vitest";
import {
  deriveRenderState,
  type AcceptActionData,
  type LoaderState,
} from "./i.$token.state";

describe("deriveRenderState", () => {
  it("returns the loader state unchanged on first load (no action)", () => {
    const state: LoaderState = { kind: "ok", openSlots: 2 };
    expect(deriveRenderState(state, undefined)).toEqual(state);
  });

  it("keeps the revalidated slot count after a successful accept", () => {
    // After accept the loader revalidates: invite is now accepted and the
    // open-slot count has already dropped by one. The action only signals
    // success and must NOT override the freshly-loaded slot count.
    const revalidated: LoaderState = { kind: "already-accepted", openSlots: 1 };
    const actionData: AcceptActionData = { ok: true };

    const result = deriveRenderState(revalidated, actionData);

    // Regression: previously this forced openSlots to 0, so the page read
    // "full" (totalSlots/totalSlots ingevuld) until a manual reload.
    expect(result).toEqual({ kind: "already-accepted", openSlots: 1 });
  });

  it("surfaces an explicit reject reason over the loader state", () => {
    const state: LoaderState = { kind: "ok", openSlots: 1 };
    const actionData: AcceptActionData = { ok: false, reason: "match-full" };

    expect(deriveRenderState(state, actionData)).toEqual({
      kind: "blocked",
      reason: "match-full",
    });
  });

  it("ignores a non-reject action error and defers to the loader state", () => {
    const state: LoaderState = { kind: "ok", openSlots: 2 };
    const actionData: AcceptActionData = { ok: false, error: "invalid_intent" };

    expect(deriveRenderState(state, actionData)).toEqual(state);
  });
});
