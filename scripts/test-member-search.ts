/**
 * Test member autocomplete queries (DB + export JSON).
 *
 *   pnpm exec tsx scripts/test-member-search.ts
 *   pnpm exec tsx scripts/test-member-search.ts -- "Pascal Van Hecke"
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { searchPadelstatsMembers } from "../app/lib/padelstats-catalog.server";
import {
  memberNameMatchesQuery,
  nameSearchTokens,
} from "../app/lib/padelstats-name-search.server";

const PASCAL_TV_ID = 1459783;
const DEFAULT_QUERIES = [
  "Van Hecke Pascal",
  "van hecke pascal",
  "VAN HECKE PASCAL",
  "Pascal Van Hecke",
  "pascal van hecke",
  "hecke pascal",
];

async function searchExport(query: string) {
  const path = resolve(process.cwd(), "data/all-club-members-tv.json");
  const data = JSON.parse(await readFile(path, "utf8")) as {
    rows: { members: { tvUserId: number; displayName: string }[] }[];
  };
  const tokens = nameSearchTokens(query);
  const hits: { id: number; name: string }[] = [];
  for (const row of data.rows) {
    for (const m of row.members) {
      if (!memberNameMatchesQuery(m.displayName, tokens)) continue;
      hits.push({ id: m.tvUserId, name: m.displayName });
    }
  }
  hits.sort((a, b) => a.name.localeCompare(b.name, "nl"));
  return hits.slice(0, 10);
}

async function main() {
  const extra = process.argv.slice(2).filter((a) => a !== "--");
  const queries = extra.length > 0 ? extra : DEFAULT_QUERIES;

  console.log("=== Export JSON (all-club-members-tv.json) ===\n");
  for (const q of queries) {
    const hits = await searchExport(q);
    const pascal = hits.find((h) => h.id === PASCAL_TV_ID);
    console.log(`«${q}» → ${hits.length} hit(s), Pascal: ${pascal ? `✓ ${pascal.name} (${pascal.id})` : "✗ niet in top 10"}`);
    if (hits.length > 0 && hits.length <= 5) {
      for (const h of hits) console.log(`   · ${h.name} (${h.id})`);
    }
  }

  if (!process.env.DATABASE_URL?.trim()) {
    console.log("\n(DATABASE_URL ontbreekt — DB-test overgeslagen)");
    return;
  }

  console.log("\n=== Postgres (TvMember) ===\n");
  for (const q of queries) {
    try {
      const hits = await searchPadelstatsMembers(q);
      const pascal = hits.find((h) => h.id === PASCAL_TV_ID);
      console.log(
        `«${q}» → ${hits.length} hit(s), Pascal: ${pascal ? `✓ ${pascal.label}` : hits.length ? "✗ niet in top 10" : "✗ geen resultaten"}`,
      );
      for (const h of hits.slice(0, 5)) {
        console.log(`   · ${h.label} (id ${h.id})`);
      }
    } catch (err) {
      console.log(`«${q}» → fout: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
