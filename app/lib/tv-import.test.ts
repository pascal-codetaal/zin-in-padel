import { describe, expect, it } from "vitest";
import { parseTvPadelRanking } from "~/lib/tv-import.server";

describe("parseTvPadelRanking", () => {
  it("parses P-rankings", () => {
    expect(parseTvPadelRanking("P400")).toEqual({
      currentRank: 400,
      subCategory: "",
    });
    expect(parseTvPadelRanking("P50*")).toEqual({
      currentRank: 50,
      subCategory: "*",
    });
  });

  it("returns zero for empty", () => {
    expect(parseTvPadelRanking(null)).toEqual({
      currentRank: 0,
      subCategory: "",
    });
  });
});
