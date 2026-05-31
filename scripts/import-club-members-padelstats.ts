/**
 * Import padelstats rosters from fetch output into Postgres.
 *
 * Imports:
 * 1. All clubs from data/clubs.json → Club
 * 2. padelstatsClubId from export (where matched)
 * 3. Members + memberships from export (where roster exists)
 *
 * Prerequisite: pnpm clubs:padelstats:all  →  data/all-club-members.json
 * Then: pnpm db:migrate:deploy
 *
 * Run:
 *   pnpm clubs:padelstats:import
 *   pnpm clubs:padelstats:import -- --club-id 8221
 *   pnpm clubs:padelstats:import -- --dry-run
 */
import "dotenv/config";
import { resolve } from "node:path";
import {
  importPadelstatsRosters,
  loadClubMembersExport,
} from "../app/lib/padelstats-import.server";
function parseArgs(argv: string[]) {
  let file: string | null = null;
  let clubsFile: string | null = null;
  let clubId: string | null = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--file" || arg === "-f") {
      file = argv[++i] ?? null;
    } else if (arg === "--clubs-file") {
      clubsFile = argv[++i] ?? null;
    } else if (arg === "--club-id") {
      clubId = argv[++i] ?? null;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: tsx scripts/import-club-members-padelstats.ts [options]

Options:
  --file, -f <path>       Roster export (default: data/all-club-members.json)
  --clubs-file <path>     Club catalog (default: data/clubs.json)
  --club-id <id>          Limit to one catalog club
  --dry-run               Count rows only, no DB writes
`);
      process.exit(0);
    }
  }

  return {
    file: file ? resolve(file) : undefined,
    clubsFile: clubsFile ? resolve(clubsFile) : undefined,
    clubId: clubId ?? null,
    dryRun,
  };
}

async function main() {
  const { file, clubsFile, clubId, dryRun } = parseArgs(process.argv.slice(2));

  const exportData = await loadClubMembersExport(file);
  const unique =
    exportData.uniqueMembers ??
    new Set(
      exportData.rows.flatMap((r) =>
        (r.report?.members ?? []).map((m) => m.id),
      ),
    ).size;
  console.log(
    `Loaded export: ${exportData.matched}/${exportData.processed} clubs with roster, ${exportData.totalMembers} membership rows, ${unique} unique padelstats member ids`,
  );
  console.log("Importing (members upserted in parallel batches, may take a few minutes)…");

  const result = await importPadelstatsRosters({
    export: exportData,
    clubsFile,
    clubId: clubId ?? undefined,
    dryRun,
  });

  const prefix = dryRun ? "[dry-run] Would import" : "Imported";
  console.log(
    `${prefix}: ${result.clubsCatalogImported} clubs (catalog), ${result.clubsPadelstatsLinked} padelstats links, ${result.clubsWithRoster} with roster, ${result.membersUpserted} unique members, ${result.membershipsWritten} memberships (${result.clubsWithoutRoster} export rows without roster)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
