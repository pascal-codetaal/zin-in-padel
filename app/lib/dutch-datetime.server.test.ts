import { describe, expect, it } from "vitest";
import { parseDutchDateTime } from "~/lib/dutch-datetime.server";
import { getZonedParts } from "~/lib/timezone";

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
});
