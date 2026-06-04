/**
 * Backfill TvMember (+ club links) from imported PadelstatsMember rows.
 * Fixes search/waitlist for players on padelstats but missing from TV clubleden HTML.
 *
 * Run after: pnpm clubs:padelstats:import
 */
import "dotenv/config";
import { prisma } from "../app/lib/prisma.server";
import { upsertTvMemberFromPadelstats } from "../app/lib/tv-member-sync.server";

const BATCH = 80;

async function main() {
  const padelstatsIds = (
    await prisma.padelstatsMember.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    })
  ).map((m) => m.id);

  const missing: number[] = [];
  for (let i = 0; i < padelstatsIds.length; i += BATCH) {
    const batch = padelstatsIds.slice(i, i + BATCH);
    const existing = await prisma.tvMember.findMany({
      where: { id: { in: batch } },
      select: { id: true },
    });
    const have = new Set(existing.map((m) => m.id));
    for (const id of batch) {
      if (!have.has(id)) missing.push(id);
    }
  }

  if (missing.length === 0) {
    console.log("All PadelstatsMember rows already have a TvMember mirror.");
    return;
  }

  console.log(`Syncing ${missing.length} padelstats-only members to TvMember…`);
  const now = new Date();
  let done = 0;

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await Promise.all(batch.map((id) => upsertTvMemberFromPadelstats(id, now)));
    done += batch.length;
    if (done % 400 === 0 || done === missing.length) {
      console.error(`  ${done}/${missing.length}`);
    }
  }

  console.log(`Done. ${done} TvMember rows upserted from padelstats.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
