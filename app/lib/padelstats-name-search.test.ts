import { describe, expect, it } from "vitest";
import {
  memberNameMatchesQuery,
  nameSearchTokens,
} from "~/lib/padelstats-name-search.server";

describe("memberNameMatchesQuery", () => {
  const tokens = nameSearchTokens("pascal van hecke");

  it("matches regardless of token order in the query", () => {
    expect(memberNameMatchesQuery("Van Hecke Pascal", tokens)).toBe(true);
    expect(
      memberNameMatchesQuery("Vanhecke Pascal", nameSearchTokens("van hecke pascal")),
    ).toBe(true);
    expect(
      memberNameMatchesQuery("Pascal Van Hecke", nameSearchTokens("hecke pascal")),
    ).toBe(true);
  });

  it("rejects unrelated names", () => {
    expect(memberNameMatchesQuery("Janssens Jan", tokens)).toBe(false);
  });
});
