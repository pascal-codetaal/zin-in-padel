import { describe, expect, it } from "vitest";
import { decideCascadePhase } from "./decide";
import { makeInvite, makeMatch } from "./test-fixtures";

const NOW = new Date("2026-05-30T10:00:00.000Z");

describe("decideCascadePhase", () => {
  describe("idle conditions", () => {
    it("idles when match is cancelled", () => {
      const match = makeMatch({ status: "cancelled" });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "idle",
        reason: "cancelled",
      });
    });

    it("idles when scheduledAt is null", () => {
      const match = makeMatch({ scheduledAt: null });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "idle",
        reason: "no-scheduled-at",
      });
    });

    it("idles when now is past scheduledAt", () => {
      const match = makeMatch({ scheduledAt: "2026-05-30T09:00:00.000Z" });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "idle",
        reason: "past-starts-at",
      });
    });

    it("idles when nextCascadeAt is in the future", () => {
      const match = makeMatch({
        currentCascadePhase: 1,
        nextCascadeAt: "2026-05-30T10:30:00.000Z",
        fallbackToLevelRange: true,
      });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "idle",
        reason: "not-yet-due",
      });
    });
  });

  describe("mark-full", () => {
    it("marks full when confirmedSlotNames fill the court", () => {
      const match = makeMatch({
        confirmedSlotNames: ["A", "B", "C", "D"],
      });
      expect(decideCascadePhase(match, NOW)).toEqual({ kind: "mark-full" });
    });

    it("marks full when invitedPlayers accepted fill remaining slots", () => {
      const match = makeMatch({
        confirmedSlotNames: ["Organiser"],
        invitedPlayers: [
          makeInvite({ playerRef: "p1", status: "accepted" }),
          makeInvite({ playerRef: "p2", status: "accepted" }),
          makeInvite({ playerRef: "p3", status: "accepted" }),
        ],
      });
      expect(decideCascadePhase(match, NOW)).toEqual({ kind: "mark-full" });
    });

    it("marks full from a mix of confirmed names and accepted invites", () => {
      // Organiser + 1 Playtomic ✅ name + 2 accepts = 4 slots.
      const match = makeMatch({
        confirmedSlotNames: ["Organiser", "Anke"],
        invitedPlayers: [
          makeInvite({ playerRef: "p1", status: "accepted" }),
          makeInvite({ playerRef: "p2", status: "accepted" }),
          makeInvite({ playerRef: "p3", status: "pending" }),
        ],
      });
      expect(decideCascadePhase(match, NOW)).toEqual({ kind: "mark-full" });
    });
  });

  describe("phase 1 firing", () => {
    it("fires phase 1 on a brand-new match with no fallbacks", () => {
      const match = makeMatch({ currentCascadePhase: 0 });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "fire-phase",
        phase: 1,
        nextAt: null,
      });
    });

    it("fires phase 1 and schedules phase 2 when fallbackToLevelRange", () => {
      const match = makeMatch({
        currentCascadePhase: 0,
        fallbackToLevelRange: true,
        fallbackLevelDelayMinutes: 30,
      });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "fire-phase",
        phase: 1,
        nextAt: new Date("2026-05-30T10:30:00.000Z"),
      });
    });

    it("fires phase 1 and schedules phase 3 directly when level is off but everyone is on", () => {
      const match = makeMatch({
        currentCascadePhase: 0,
        fallbackToLevelRange: false,
        fallbackToEveryone: true,
        fallbackEveryoneDelayMinutes: 60,
      });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "fire-phase",
        phase: 1,
        nextAt: new Date("2026-05-30T11:00:00.000Z"),
      });
    });
  });

  describe("phase 2 firing", () => {
    it("fires phase 2 when due and schedules phase 3", () => {
      const match = makeMatch({
        currentCascadePhase: 1,
        nextCascadeAt: "2026-05-30T09:30:00.000Z",
        fallbackToLevelRange: true,
        fallbackToEveryone: true,
        fallbackEveryoneDelayMinutes: 60,
      });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "fire-phase",
        phase: 2,
        nextAt: new Date("2026-05-30T11:00:00.000Z"),
      });
    });

    it("fires phase 2 and ends cascade when everyone is off", () => {
      const match = makeMatch({
        currentCascadePhase: 1,
        nextCascadeAt: "2026-05-30T09:30:00.000Z",
        fallbackToLevelRange: true,
        fallbackToEveryone: false,
      });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "fire-phase",
        phase: 2,
        nextAt: null,
      });
    });
  });

  describe("phase 3 firing", () => {
    it("fires phase 3 with no further nextAt", () => {
      const match = makeMatch({
        currentCascadePhase: 2,
        nextCascadeAt: "2026-05-30T09:30:00.000Z",
        fallbackToLevelRange: true,
        fallbackToEveryone: true,
      });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "fire-phase",
        phase: 3,
        nextAt: null,
      });
    });
  });

  describe("mark-exhausted", () => {
    it("marks exhausted when phase 1 fired and no fallbacks enabled", () => {
      const match = makeMatch({
        currentCascadePhase: 1,
        fallbackToLevelRange: false,
        fallbackToEveryone: false,
      });
      expect(decideCascadePhase(match, NOW)).toEqual({ kind: "mark-exhausted" });
    });

    it("marks exhausted when phase 2 fired and everyone disabled", () => {
      const match = makeMatch({
        currentCascadePhase: 2,
        fallbackToLevelRange: true,
        fallbackToEveryone: false,
      });
      expect(decideCascadePhase(match, NOW)).toEqual({ kind: "mark-exhausted" });
    });

    it("marks exhausted when all phases fired", () => {
      const match = makeMatch({
        currentCascadePhase: 3,
        fallbackToLevelRange: true,
        fallbackToEveryone: true,
      });
      expect(decideCascadePhase(match, NOW)).toEqual({ kind: "mark-exhausted" });
    });
  });

  describe("precedence", () => {
    it("mark-full beats not-yet-due", () => {
      const match = makeMatch({
        confirmedSlotNames: ["A", "B", "C", "D"],
        currentCascadePhase: 1,
        nextCascadeAt: "2026-05-30T11:00:00.000Z",
      });
      expect(decideCascadePhase(match, NOW)).toEqual({ kind: "mark-full" });
    });

    it("cancelled beats mark-full", () => {
      const match = makeMatch({
        status: "cancelled",
        confirmedSlotNames: ["A", "B", "C", "D"],
      });
      expect(decideCascadePhase(match, NOW)).toEqual({
        kind: "idle",
        reason: "cancelled",
      });
    });
  });
});
