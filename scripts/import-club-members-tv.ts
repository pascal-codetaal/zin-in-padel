/**
 * Import TV clubleden export into Postgres (TvMember + ClubTvMembership).
 *
 * Prerequisite:
 *   pnpm clubs:tv:all:padel   →  data/all-club-members-tv.json
 *   pnpm db:migrate:deploy
 *
 * Run:
 *   pnpm clubs:tv:import
 *   pnpm clubs:tv:import -- --dry-run
 *   pnpm clubs:tv:import -- --club-id 8041
 */
import "dotenv/config";
import { resolve } from "node:path";
import {
  importTvClubRosters,
  loadTvClubMembersExport,
} from "../app/lib/tv-import.server";

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
      console.log(`Usage: tsx scripts/import-club-members-tv.ts [options]

Options:
  --file, -f <path>     TV export (default: data/all-club-members-tv.json)
  --clubs-file <path>   Club catalog (default: data/clubs.json)
  --club-id <id>        Limit to one catalog club
  --dry-run             Count only, no DB writes
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

  const exportData = await loadTvClubMembersExport(file);
  console.log(
    `Loaded TV export: ${exportData.withRoster}/${exportData.processed} rosters, ${exportData.totalMembers} unique members in file`,
  );
  if (exportData.padelOnly) {
    console.log("(export is padel-only)");
  }

  console.log("Importing TV members (parallel upserts, may take several minutes)…");

  const result = await importTvClubRosters({
    export: exportData,
    clubsFile,
    clubId: clubId ?? undefined,
    dryRun,
  });

  const prefix = dryRun ? "[dry-run] Would import" : "Imported";
  console.log(
    `${prefix}: ${result.clubsCatalogImported} clubs (catalog), ${result.clubsTvLinked} TV club links, ${result.clubsWithRoster} with roster, ${result.membersUpserted} unique members, ${result.membershipsWritten} memberships (${result.exportErrors} export rows with errors)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
