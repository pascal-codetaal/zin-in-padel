import { describe, expect, it } from "vitest";
import {
  currentDutchDateLabel,
  parseDutchDateTime,
} from "~/lib/dutch-datetime.server";
import { getZonedParts } from "~/lib/timezone";

/** Brussels calendar date `offset` days from today, as UTC-calendar parts. */
function brusselsDatePlus(offset: number) {
  const today = getZonedParts(new Date());
  const cal = new Date(Date.UTC(today.year, today.month - 1, today.day));
  cal.setUTCDate(cal.getUTCDate() + offset);
  return {
    year: cal.getUTCFullYear(),
    month: cal.getUTCMonth() + 1,
    day: cal.getUTCDate(),
  };
}

describe("parseDutchDateTime", () => {
  it("resolves a weekday + time to a future Brussels instant", () => {
    const { iso, weekdayResolved } = parseDutchDateTime({
      weekday: "zaterdag",
      hour: 19,
      minute: 0,
    });
    const parts = getZonedParts(new Date(iso));
    expect(parts.hour).toBe(19);
    expect(parts.minute).toBe(0);
    expect(weekdayResolved).toBe("zaterdag");
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
  });

  it("resolves a day-of-month + time to that day at the requested Brussels hour", () => {
    const { iso } = parseDutchDateTime({ day: 15, hour: 10, minute: 30 });
    const parts = getZonedParts(new Date(iso));
    expect(parts.day).toBe(15);
    expect(parts.hour).toBe(10);
    expect(parts.minute).toBe(30);
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
  });

  it("throws when neither day nor weekday is given", () => {
    expect(() => parseDutchDateTime({ hour: 19, minute: 0 })).toThrow();
  });

  it("resolves relativeDay 'morgen' to tomorrow at the requested Brussels hour", () => {
    const { iso } = parseDutchDateTime({
      relativeDay: "morgen",
      hour: 21,
      minute: 0,
    });
    const parts = getZonedParts(new Date(iso));
    const expected = brusselsDatePlus(1);
    expect(parts.year).toBe(expected.year);
    expect(parts.month).toBe(expected.month);
    expect(parts.day).toBe(expected.day);
    expect(parts.hour).toBe(21);
    expect(parts.minute).toBe(0);
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
  });

  it("resolves relativeDay 'overmorgen' to two days ahead", () => {
    const { iso } = parseDutchDateTime({
      relativeDay: "overmorgen",
      hour: 10,
      minute: 30,
    });
    const parts = getZonedParts(new Date(iso));
    const expected = brusselsDatePlus(2);
    expect(parts.day).toBe(expected.day);
    expect(parts.month).toBe(expected.month);
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
  });

  it("resolves relativeDay 'vandaag' to today's Brussels date", () => {
    const { iso } = parseDutchDateTime({
      relativeDay: "vandaag",
      hour: 12,
      minute: 0,
    });
    const parts = getZonedParts(new Date(iso));
    const expected = brusselsDatePlus(0);
    expect(parts.day).toBe(expected.day);
    expect(parts.month).toBe(expected.month);
    expect(parts.hour).toBe(12);
  });

  it("lets relativeDay win over day/weekday", () => {
    const { iso } = parseDutchDateTime({
      relativeDay: "morgen",
      day: 15,
      weekday: "zaterdag",
      hour: 9,
      minute: 0,
    });
    const parts = getZonedParts(new Date(iso));
    const expected = brusselsDatePlus(1);
    expect(parts.day).toBe(expected.day);
  });
});

describe("currentDutchDateLabel", () => {
  it("labels a fixed Brussels instant in Dutch", () => {
    expect(currentDutchDateLabel(new Date("2026-06-07T10:00:00.000Z"))).toBe(
      "zondag 7 juni 2026",
    );
  });
});
