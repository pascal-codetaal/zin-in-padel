// Smoke test for club search. Run: npx tsx scripts/smoke-clubs.ts
import { loadClubs, searchClubs } from "../app/lib/clubs.server";

async function main() {
  const all = await loadClubs();
  console.assert(all.length === 329, `expected 329 clubs, got ${all.length}`);
  console.assert(all.every((c) => c.id.length > 0), "every club has id");
  console.log(`✓ loaded ${all.length} clubs`);

  const gent = await searchClubs("Gent");
  console.assert(gent.length > 0, "Gent search has results");
  console.log(`✓ search 'Gent': ${gent.length} results (max 15)`);

  const arena = await searchClubs("Arenal Antwerpen");
  if (arena.length === 0) throw new Error("Arenal Antwerpen search failed");
  console.log(`✓ search 'Arenal Antwerpen': ${arena[0]?.name}`);

  console.log("\nALL CLUB SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
