import { describe, expect, it } from "vitest";
import { memberRankAsPadelLevel } from "~/lib/padelstats-catalog.server";

describe("memberRankAsPadelLevel", () => {
  it("accepts TV-style ranks", () => {
    expect(memberRankAsPadelLevel(300)).toBe(300);
    expect(memberRankAsPadelLevel(50)).toBe(50);
  });

  it("rejects invalid ranks", () => {
    expect(memberRankAsPadelLevel(999)).toBeNull();
  });
});
