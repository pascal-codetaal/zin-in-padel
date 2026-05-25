import { describe, expect, it } from "vitest";
import { decideEarlyAdvance } from "./early-advance";
import { makeInvite, makeMatch } from "./test-fixtures";

const NOW = new Date("2026-05-30T10:00:00.000Z");

describe("decideEarlyAdvance — advances when current phase fully responded", () => {
  it("advances phase 1 when all friends responded (decline/accept mix) and phase 2 enabled", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      nextCascadeAt: "2026-05-30T10:30:00.000Z",
      fallbackToLevelRange: true,
      fallbackLevelMin: 200,
      fallbackLevelMax: 400,
      invitedPlayers: [
        makeInvite({ playerRef: "p1", token: "t1", status: "declined", cascadePhase: 1 }),
        makeInvite({ playerRef: "p2", token: "t2", status: "declined", cascadePhase: 1 }),
        makeInvite({ playerRef: "p3", token: "t3", status: "accepted", cascadePhase: 1 }),
      ],
      confirmedSlotNames: ["Organiser"],
    });

    const decision = decideEarlyAdvance({ match, now: NOW });
    expect(decision).toEqual({
      kind: "advance",
      nextCascadeAt: NOW.toISOString(),
    });
  });

  it("advances phase 2 when all level invitees responded and phase 3 enabled", () => {
    const match = makeMatch({
      currentCascadePhase: 2,
      nextCascadeAt: "2026-05-30T11:30:00.000Z",
      fallbackToLevelRange: true,
      fallbackToEveryone: true,
      invitedPlayers: [
        makeInvite({ playerRef: "p1", token: "t1", status: "declined", cascadePhase: 1 }),
        makeInvite({ playerRef: "p2", token: "t2", status: "declined", cascadePhase: 2 }),
      ],
      confirmedSlotNames: ["Organiser"],
    });

    const decision = decideEarlyAdvance({ match, now: NOW });
    expect(decision.kind).toBe("advance");
  });
});

describe("decideEarlyAdvance — no-op cases", () => {
  it("does not advance when some current-phase invites are still pending", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: true,
      invitedPlayers: [
        makeInvite({ playerRef: "p1", token: "t1", status: "declined", cascadePhase: 1 }),
        makeInvite({ playerRef: "p2", token: "t2", status: "pending", cascadePhase: 1 }),
      ],
    });

    expect(decideEarlyAdvance({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "still-pending",
    });
  });

  it("does not advance when match is full", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: true,
      confirmedSlotNames: ["A", "B", "C", "D"],
      invitedPlayers: [
        makeInvite({ status: "declined", cascadePhase: 1 }),
      ],
    });

    expect(decideEarlyAdvance({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "match-full",
    });
  });

  it("does not advance when match is cancelled", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: true,
      status: "cancelled",
      invitedPlayers: [makeInvite({ status: "declined", cascadePhase: 1 })],
    });

    expect(decideEarlyAdvance({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "match-cancelled",
    });
  });

  it("does not advance when no next phase is configured", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      fallbackToLevelRange: false,
      fallbackToEveryone: false,
      invitedPlayers: [makeInvite({ status: "declined", cascadePhase: 1 })],
    });

    expect(decideEarlyAdvance({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "no-next-phase",
    });
  });

  it("does not advance when phase 2 has no further fallback to everyone", () => {
    const match = makeMatch({
      currentCascadePhase: 2,
      fallbackToLevelRange: true,
      fallbackToEveryone: false,
      invitedPlayers: [makeInvite({ status: "declined", cascadePhase: 2 })],
    });

    expect(decideEarlyAdvance({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "no-next-phase",
    });
  });

  it("does not advance when cascade has not started yet", () => {
    const match = makeMatch({
      currentCascadePhase: 0,
      fallbackToLevelRange: true,
    });

    expect(decideEarlyAdvance({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "no-active-phase",
    });
  });

  it("does not advance when nextCascadeAt is already due (cron will handle it)", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      nextCascadeAt: "2026-05-30T09:59:00.000Z",
      fallbackToLevelRange: true,
      invitedPlayers: [makeInvite({ status: "declined", cascadePhase: 1 })],
    });

    expect(decideEarlyAdvance({ match, now: NOW })).toEqual({
      kind: "no-op",
      reason: "already-due",
    });
  });
});
