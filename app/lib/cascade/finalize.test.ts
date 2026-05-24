import { describe, expect, it } from "vitest";
import { computeInitialCascadeState } from "./finalize";
import { makeMatch } from "./test-fixtures";

const NOW = new Date("2026-05-30T10:00:00.000Z");

describe("computeInitialCascadeState", () => {
  it("schedules phase 2 when level fallback is on", () => {
    const match = makeMatch({
      scheduledAt: "2026-06-01T19:00:00.000Z",
      fallbackToLevelRange: true,
      fallbackLevelDelayMinutes: 30,
    });
    const state = computeInitialCascadeState(match, NOW);
    expect(state.currentCascadePhase).toBe(1);
    expect(state.nextCascadeAt).toEqual(
      new Date("2026-05-30T10:30:00.000Z"),
    );
  });

  it("schedules phase 3 when level fallback is off but everyone fallback is on", () => {
    const match = makeMatch({
      fallbackToLevelRange: false,
      fallbackToEveryone: true,
      fallbackEveryoneDelayMinutes: 60,
    });
    const state = computeInitialCascadeState(match, NOW);
    expect(state.currentCascadePhase).toBe(1);
    expect(state.nextCascadeAt).toEqual(
      new Date("2026-05-30T11:00:00.000Z"),
    );
  });

  it("leaves nextCascadeAt null when no fallbacks configured", () => {
    const match = makeMatch({
      fallbackToLevelRange: false,
      fallbackToEveryone: false,
    });
    const state = computeInitialCascadeState(match, NOW);
    expect(state.currentCascadePhase).toBe(1);
    expect(state.nextCascadeAt).toBeNull();
  });

  it("ignores any cascade state already on the draft", () => {
    const match = makeMatch({
      currentCascadePhase: 2,
      nextCascadeAt: "2026-05-30T15:00:00.000Z",
      fallbackToLevelRange: true,
      fallbackLevelDelayMinutes: 30,
    });
    const state = computeInitialCascadeState(match, NOW);
    expect(state.currentCascadePhase).toBe(1);
    expect(state.nextCascadeAt).toEqual(
      new Date("2026-05-30T10:30:00.000Z"),
    );
  });
});
