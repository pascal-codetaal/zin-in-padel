import { describe, expect, it } from "vitest";
import {
  planAddConfirmedSlot,
  planCancelMatch,
  planRemovePlayer,
  planSkipPhase,
} from "./organiser";
import { makeInvite, makeMatch } from "./test-fixtures";

const NOW = new Date("2026-06-01T18:00:00.000Z");

describe("planSkipPhase", () => {
  it("nudges nextCascadeAt=now when phase 2 is scheduled in the future", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: true,
      fallbackLevelMin: 300,
      fallbackLevelMax: 500,
      nextCascadeAt: "2026-06-01T18:30:00.000Z",
    });
    const plan = planSkipPhase({ match, now: NOW });
    expect(plan.kind).toBe("skip");
    if (plan.kind !== "skip") return;
    expect(plan.nextCascadeAt).toBe(NOW.toISOString());
    expect(plan.nextPhase).toBe(2);
  });

  it("no-op when match is cancelled", () => {
    const match = makeMatch({ status: "cancelled" });
    expect(planSkipPhase({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "match-cancelled",
    });
  });

  it("no-op when match is full", () => {
    const match = makeMatch({
      confirmedSlotNames: ["Joris", "Pascal", "Tom", "Eva"],
    });
    expect(planSkipPhase({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "match-full",
    });
  });

  it("no-op when no next phase configured", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: false,
      fallbackToEveryone: false,
    });
    expect(planSkipPhase({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "no-next-phase",
    });
  });

  it("no-op when cascade is already due", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: true,
      nextCascadeAt: "2026-06-01T17:00:00.000Z", // before now
    });
    expect(planSkipPhase({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "already-due",
    });
  });

  it("skips phase 2 when only phase 3 is enabled", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: false,
      fallbackToEveryone: true,
      nextCascadeAt: "2026-06-01T19:00:00.000Z",
    });
    const plan = planSkipPhase({ match, now: NOW });
    expect(plan.kind).toBe("skip");
    if (plan.kind !== "skip") return;
    expect(plan.nextPhase).toBe(3);
  });
});

describe("planRemovePlayer", () => {
  it("removes an accepted invite and notifies the player", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "accepted" }),
      ],
    });
    const plan = planRemovePlayer({
      match,
      playerRef: "+32490000001",
      now: NOW,
    });
    expect(plan.kind).toBe("remove");
    if (plan.kind !== "remove") return;
    expect(plan.from).toBe("accepted-invite");
    expect(plan.playerRef).toBe("+32490000001");
    expect(plan.notifications).toEqual([
      { playerRef: "+32490000001", kind: "removed-from-match" },
    ]);
  });

  it("removes a confirmed-slot name (no notification)", () => {
    const match = makeMatch({
      confirmedSlotNames: ["Joris", "Pascal", "Tom"],
    });
    const plan = planRemovePlayer({
      match,
      confirmedSlotName: "Pascal",
      now: NOW,
    });
    expect(plan.kind).toBe("remove");
    if (plan.kind !== "remove") return;
    expect(plan.from).toBe("confirmed-slot");
    expect(plan.confirmedSlotNames).toEqual(["Joris", "Tom"]);
    expect(plan.notifications).toEqual([]);
  });

  it("no-op when match is cancelled", () => {
    const match = makeMatch({ status: "cancelled" });
    expect(
      planRemovePlayer({ match, playerRef: "+32490000001", now: NOW }),
    ).toEqual({ kind: "no-op", reason: "match-cancelled" });
  });

  it("no-op when invite is not accepted (still pending)", () => {
    const match = makeMatch({
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "pending" }),
      ],
    });
    expect(
      planRemovePlayer({ match, playerRef: "+32490000001", now: NOW }),
    ).toEqual({ kind: "no-op", reason: "not-on-court" });
  });

  it("no-op when confirmed-slot name is not found", () => {
    const match = makeMatch({ confirmedSlotNames: ["Joris"] });
    expect(
      planRemovePlayer({ match, confirmedSlotName: "Pascal", now: NOW }),
    ).toEqual({ kind: "no-op", reason: "not-found" });
  });

  it("resumes cascade when nextCascadeAt was null and phase remains", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: true,
      fallbackLevelMin: 300,
      fallbackLevelMax: 500,
      nextCascadeAt: null, // had been marked-full earlier
      confirmedSlotNames: ["Joris", "Pascal", "Tom"],
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "accepted" }),
      ],
    });
    const plan = planRemovePlayer({
      match,
      playerRef: "+32490000001",
      now: NOW,
    });
    expect(plan.kind).toBe("remove");
    if (plan.kind !== "remove") return;
    expect(plan.nextCascadeAt).toBe(NOW.toISOString());
  });

  it("preserves existing nextCascadeAt when cascade is already scheduled", () => {
    const scheduled = "2026-06-01T18:30:00.000Z";
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: true,
      nextCascadeAt: scheduled,
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "accepted" }),
      ],
    });
    const plan = planRemovePlayer({
      match,
      playerRef: "+32490000001",
      now: NOW,
    });
    expect(plan.kind).toBe("remove");
    if (plan.kind !== "remove") return;
    expect(plan.nextCascadeAt).toBe(scheduled);
  });
});

describe("planCancelMatch", () => {
  it("invalidates pending + accepted tokens and lists notifications", () => {
    const match = makeMatch({
      invitedPlayers: [
        makeInvite({
          playerRef: "+32490000001",
          token: "tok-pending-1",
          status: "pending",
        }),
        makeInvite({
          playerRef: "+32490000002",
          token: "tok-accepted-1",
          status: "accepted",
        }),
        makeInvite({
          playerRef: "+32490000003",
          token: "tok-declined-1",
          status: "declined",
        }),
      ],
    });
    const plan = planCancelMatch({ match });
    expect(plan.kind).toBe("cancel");
    if (plan.kind !== "cancel") return;
    expect(plan.invalidateTokens).toEqual(["tok-pending-1", "tok-accepted-1"]);
    expect(plan.notifications).toEqual([
      { playerRef: "+32490000001", kind: "match-cancelled" },
      { playerRef: "+32490000002", kind: "match-cancelled" },
    ]);
  });

  it("no-op when match is already cancelled", () => {
    const match = makeMatch({ status: "cancelled" });
    expect(planCancelMatch({ match })).toEqual({
      kind: "no-op",
      reason: "already-cancelled",
    });
  });

  it("empty notifications when no live invites", () => {
    const match = makeMatch({
      invitedPlayers: [
        makeInvite({
          playerRef: "+32490000003",
          token: "tok-declined-1",
          status: "declined",
        }),
      ],
    });
    const plan = planCancelMatch({ match });
    expect(plan.kind).toBe("cancel");
    if (plan.kind !== "cancel") return;
    expect(plan.invalidateTokens).toEqual([]);
    expect(plan.notifications).toEqual([]);
  });
});

describe("planAddConfirmedSlot", () => {
  it("appends a trimmed name when there's an open slot", () => {
    const match = makeMatch({ confirmedSlotNames: ["Joris"] });
    const plan = planAddConfirmedSlot({ match, name: "  Tom  " });
    expect(plan.kind).toBe("add");
    if (plan.kind !== "add") return;
    expect(plan.confirmedSlotNames).toEqual(["Joris", "Tom"]);
  });

  it("no-op when name is empty", () => {
    const match = makeMatch();
    expect(planAddConfirmedSlot({ match, name: "   " })).toEqual({
      kind: "no-op",
      reason: "empty-name",
    });
  });

  it("no-op on case-insensitive duplicate", () => {
    const match = makeMatch({ confirmedSlotNames: ["Joris"] });
    expect(planAddConfirmedSlot({ match, name: "joris" })).toEqual({
      kind: "no-op",
      reason: "duplicate-name",
    });
  });

  it("no-op when match is full", () => {
    const match = makeMatch({
      confirmedSlotNames: ["Joris", "Pascal", "Tom", "Eva"],
    });
    expect(planAddConfirmedSlot({ match, name: "Lisa" })).toEqual({
      kind: "no-op",
      reason: "match-full",
    });
  });

  it("no-op when match is cancelled", () => {
    const match = makeMatch({ status: "cancelled" });
    expect(planAddConfirmedSlot({ match, name: "Tom" })).toEqual({
      kind: "no-op",
      reason: "match-cancelled",
    });
  });
});
