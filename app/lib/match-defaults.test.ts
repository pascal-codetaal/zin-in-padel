import { describe, expect, it } from "vitest";
import {
  formatScheduledAt,
  fromDatetimeLocalValue,
  nextSaturdayEvening,
  toDatetimeLocalValue,
} from "~/lib/match-defaults";

describe("fromDatetimeLocalValue", () => {
  it("reads the naive input as Brussels wall time (summer / CEST)", () => {
    expect(fromDatetimeLocalValue("2026-06-06T19:00")).toBe(
      "2026-06-06T17:00:00.000Z",
    );
  });

  it("reads the naive input as Brussels wall time (winter / CET)", () => {
    expect(fromDatetimeLocalValue("2026-01-10T19:00")).toBe(
      "2026-01-10T18:00:00.000Z",
    );
  });

  it("returns null for blank or malformed input", () => {
    expect(fromDatetimeLocalValue(null)).toBeNull();
    expect(fromDatetimeLocalValue("  ")).toBeNull();
    expect(fromDatetimeLocalValue("not-a-date")).toBeNull();
  });
});

describe("toDatetimeLocalValue", () => {
  it("renders a UTC instant as the Brussels wall-clock input value", () => {
    expect(toDatetimeLocalValue(new Date("2026-06-06T17:00:00.000Z"))).toBe(
      "2026-06-06T19:00",
    );
  });

  it("round-trips with fromDatetimeLocalValue", () => {
    const wall = "2026-03-21T09:30";
    expect(toDatetimeLocalValue(new Date(fromDatetimeLocalValue(wall)!))).toBe(
      wall,
    );
  });
});

describe("formatScheduledAt", () => {
  it("renders the Brussels hour regardless of process timezone", () => {
    const out = formatScheduledAt("2026-06-06T17:00:00.000Z");
    expect(out).toContain("19:00");
    expect(out.toLowerCase()).toContain("zaterdag");
  });

  it("returns an em-dash for a null instant", () => {
    expect(formatScheduledAt(null)).toBe("—");
  });
});

describe("nextSaturdayEvening", () => {
  it("is the next future Saturday at 19:00 Brussels", () => {
    const monday = new Date("2026-06-01T12:00:00.000Z");
    const sat = nextSaturdayEvening(monday);
    expect(sat.getTime()).toBeGreaterThan(monday.getTime());
    expect(toDatetimeLocalValue(sat)).toBe("2026-06-06T19:00");
  });
});
