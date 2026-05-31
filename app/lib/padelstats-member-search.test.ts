import { describe, expect, it } from "vitest";
import {
  memberNameMatchesQuery,
  nameSearchTokens,
} from "~/lib/padelstats-name-search.server";

const STORED_NAME = "Van Hecke Pascal";
const TV_USER_ID = 1459783;

/** Mirrors DB pre-filter + token filter in padelstats-catalog.server.ts */
function simulateMemberSearch(
  members: { id: number; name: string }[],
  query: string,
  limit = 10,
): { id: number; name: string }[] {
  const tokens = nameSearchTokens(query);
  if (tokens.length === 0) return [];

  const candidateCap = Math.min(80, limit * 8);
  const candidates = members
    .filter((m) =>
      tokens.every((t) => m.name.toLowerCase().includes(t.toLowerCase())),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "nl"))
    .slice(0, candidateCap);

  const hits: { id: number; name: string }[] = [];
  for (const row of candidates) {
    if (!memberNameMatchesQuery(row.name, tokens)) continue;
    hits.push(row);
    if (hits.length >= limit) break;
  }
  return hits;
}

const SAMPLE_MEMBERS = [
  { id: TV_USER_ID, name: STORED_NAME },
  { id: 1, name: "Van Hecke Bianca" },
  { id: 2, name: "Van Hecke Joost" },
  { id: 3, name: "Reynvoet Pascal" },
  { id: 4, name: "Janssens Jan" },
];

describe("autocomplete: Van Hecke Pascal", () => {
  const queries = [
    "Van Hecke Pascal",
    "van hecke pascal",
    "VAN HECKE PASCAL",
    "Pascal Van Hecke",
    "PASCAL VAN HECKE",
    "pascal van hecke",
    "hecke pascal",
    "HECKE PASCAL",
    "Van Hecke  Pascal",
    "  van   hecke   pascal  ",
  ];

  for (const query of queries) {
    it(`vindt Pascal via «${query.trim()}»`, () => {
      const hits = simulateMemberSearch(SAMPLE_MEMBERS, query);
      expect(hits.some((h) => h.id === TV_USER_ID)).toBe(true);
      expect(hits[0]?.name).toBe(STORED_NAME);
    });
  }

  it("matcht opgeslagen naam ongeacht query-hoofdletters", () => {
    for (const query of queries) {
      expect(
        memberNameMatchesQuery(STORED_NAME, nameSearchTokens(query)),
      ).toBe(true);
    }
  });

  it("toont meerdere Van Hecke-familie bij alleen achternaam", () => {
    const hits = simulateMemberSearch(SAMPLE_MEMBERS, "van hecke");
    expect(hits.map((h) => h.name)).toEqual([
      "Van Hecke Bianca",
      "Van Hecke Joost",
      STORED_NAME,
    ]);
  });

  it("vindt Pascal met alleen voornaam (veel treffers mogelijk)", () => {
    const hits = simulateMemberSearch(SAMPLE_MEMBERS, "pascal");
    expect(hits.some((h) => h.id === TV_USER_ID)).toBe(true);
  });

  it("vindt niets bij één teken (UI wacht op min. 2)", () => {
    expect(simulateMemberSearch(SAMPLE_MEMBERS, "p")).toEqual([]);
  });
});
