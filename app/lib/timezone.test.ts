import { describe, expect, it } from "vitest";
import {
  getZonedParts,
  zonedWallTimeToInstant,
  zonedWeekday,
} from "~/lib/timezone";

describe("zonedWallTimeToInstant", () => {
  it("maps a summer (CEST, +2) wall time to its UTC instant", () => {
    const instant = zonedWallTimeToInstant({
      year: 2026,
      month: 6,
      day: 6,
      hour: 19,
      minute: 0,
    });
    expect(instant.toISOString()).toBe("2026-06-06T17:00:00.000Z");
  });

  it("maps a winter (CET, +1) wall time to its UTC instant", () => {
    const instant = zonedWallTimeToInstant({
      year: 2026,
      month: 1,
      day: 10,
      hour: 19,
      minute: 0,
    });
    expect(instant.toISOString()).toBe("2026-01-10T18:00:00.000Z");
  });
});

describe("getZonedParts", () => {
  it("reads Brussels wall-clock fields from a UTC instant", () => {
    expect(getZonedParts(new Date("2026-06-06T17:00:00.000Z"))).toMatchObject({
      year: 2026,
      month: 6,
      day: 6,
      hour: 19,
      minute: 0,
    });
  });

  it("round-trips with zonedWallTimeToInstant on both sides of DST", () => {
    for (const iso of [
      "2026-01-10T18:00:00.000Z",
      "2026-06-06T17:00:00.000Z",
    ]) {
      const parts = getZonedParts(new Date(iso));
      expect(zonedWallTimeToInstant(parts).toISOString()).toBe(iso);
    }
  });
});

describe("zonedWeekday", () => {
  it("returns 6 for a Saturday and 1 for a Monday", () => {
    expect(zonedWeekday(2026, 6, 6)).toBe(6);
    expect(zonedWeekday(2026, 6, 1)).toBe(1);
  });
});
