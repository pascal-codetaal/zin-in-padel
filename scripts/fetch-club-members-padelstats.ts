/**
 * Fetch padel club rosters via padelstats.be, keyed off data/clubs.json (TV catalog).
 *
 * Flow:
 * 1. Load clubs from data/clubs.json
 * 2. Search padelstats (api/list_clubs?s=…)
 * 3. Match padelstats id (CLUBNR = catalog id)
 * 4. GET members (api/get_club_report/{padelstatsId})
 *
 * Run:
 *   pnpm clubs:padelstats:test          # one club (Fit-Out, id 8221)
 *   pnpm clubs:padelstats:all           # all clubs → data/all-club-members.json
 *   pnpm clubs:padelstats -- --club-id 8221
 *   pnpm clubs:padelstats -- --all --out data/all-club-members.json
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  catalogClubToTvClub,
  findCatalogClub,
  loadClubsCatalog,
  type CatalogClub,
} from "../app/lib/clubs-catalog.server";
import {
  getPadelstatsClubReport,
  matchPadelstatsClub,
  padelstatsSearchTermFromClubName,
  searchPadelstatsClubs,
  type PadelstatsClubHit,
  type PadelstatsClubReport,
} from "../app/lib/padelstats-api.server";
type ClubSyncRow = {
  catalogClub: CatalogClub;
  padelstatsSearch: string;
  padelstatsCandidates: PadelstatsClubHit[];
  padelstatsClub: PadelstatsClubHit | null;
  report: PadelstatsClubReport | null;
  error?: string;
};

const DEFAULT_TEST_CLUB_ID = "8221"; // Fit-Out Padelclub
const DEFAULT_CONCURRENCY = 8;

function parseArgs(argv: string[]) {
  let clubId: string | null = null;
  let all = false;
  let padelstatsId: number | null = null;
  let limit: number | null = null;
  let delayMs = 0;
  let concurrency = DEFAULT_CONCURRENCY;
  let outPath: string | null = null;
  let quiet = false;
  let clubsFile: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--all") {
      all = true;
    } else if (arg === "--concurrency" || arg === "-j") {
      concurrency = Number(argv[++i]);
    } else if (arg === "--club-id") {
      clubId = argv[++i] ?? null;
    } else if (arg === "--padelstats-id") {
      padelstatsId = Number(argv[++i]);
    } else if (arg === "--limit") {
      limit = Number(argv[++i]);
    } else if (arg === "--delay") {
      delayMs = Number(argv[++i]);
    } else if (arg === "--out" || arg === "-o") {
      outPath = argv[++i] ?? null;
    } else if (arg === "--clubs-file") {
      clubsFile = argv[++i] ?? null;
    } else if (arg === "--quiet" || arg === "-q") {
      quiet = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: tsx scripts/fetch-club-members-padelstats.ts [options]

Options:
  --all                   Process every club in data/clubs.json (~330)
  --club-id <id>          One catalog club from data/clubs.json (TV id / CLUBNR)
  --padelstats-id <id>    Skip search; fetch get_club_report directly
  --limit <n>             Process at most n clubs from the catalog
  --clubs-file <path>     Catalog JSON (default: data/clubs.json)
  --concurrency, -j <n>   Parallel clubs in flight (default ${DEFAULT_CONCURRENCY})
  --delay <ms>            Stagger before each club starts (rate limit; default 0)
  --out, -o <path>        Write JSON output to file (recommended with --all)
  --quiet, -q             Progress on stderr only; omit full JSON from stdout

Examples:
  pnpm clubs:padelstats:test
  pnpm clubs:padelstats:all
  pnpm clubs:padelstats -- --club-id 8221
  pnpm clubs:padelstats -- --all -j 12 -o data/all-club-members.json -q
`);
      process.exit(0);
    }
  }

  return {
    clubId,
    all,
    padelstatsId,
    limit,
    delayMs,
    concurrency,
    outPath,
    quiet,
    clubsFile,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run async work on items with a fixed concurrency limit; preserves result order. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function logClubResult(
  index: number,
  total: number,
  row: ClubSyncRow,
  quiet: boolean,
): void {
  if (quiet) return;
  const { catalogClub } = row;
  const n = row.report?.members.length ?? 0;
  const status = row.error
    ? `✗ ${row.error}`
    : row.padelstatsClub
      ? `✓ padelstats ${row.padelstatsClub.id} (${n} members)`
      : "✗ no match";
  const extra =
    row.padelstatsCandidates.length > 1 && !row.error
      ? ` — ${row.padelstatsCandidates.length} candidates, CLUBNR ${row.padelstatsClub?.clubNr}`
      : "";
  console.error(
    `[${index + 1}/${total}] ${catalogClub.name} (id ${catalogClub.id}) ${status}${extra}`,
  );
}

async function syncOneClub(
  catalogClub: CatalogClub,
  padelstatsIdOverride: number | null,
): Promise<ClubSyncRow> {
  const tvClub = catalogClubToTvClub(catalogClub);
  const padelstatsSearch = padelstatsSearchTermFromClubName(catalogClub.name);
  const row: ClubSyncRow = {
    catalogClub,
    padelstatsSearch,
    padelstatsCandidates: [],
    padelstatsClub: null,
    report: null,
  };

  try {
    if (padelstatsIdOverride != null && Number.isFinite(padelstatsIdOverride)) {
      row.report = await getPadelstatsClubReport(padelstatsIdOverride);
      row.padelstatsClub = {
        id: padelstatsIdOverride,
        name: row.report.name,
        clubNr: Number(catalogClub.id) || 0,
        association: "TVL",
        numMembers: row.report.members.length,
        searchStr: padelstatsSearch,
      };
      return row;
    }

    row.padelstatsCandidates = await searchPadelstatsClubs(padelstatsSearch);

    row.padelstatsClub = matchPadelstatsClub(tvClub, row.padelstatsCandidates);
    if (!row.padelstatsClub) {
      row.error = "no padelstats match";
      return row;
    }

    row.report = await getPadelstatsClubReport(row.padelstatsClub.id);
  } catch (err) {
    row.error = err instanceof Error ? err.message : String(err);
  }

  return row;
}

async function main() {
  const {
    clubId,
    all,
    padelstatsId,
    limit,
    delayMs,
    concurrency,
    outPath,
    quiet,
    clubsFile,
  } = parseArgs(process.argv.slice(2));

  const poolSize =
    Number.isFinite(concurrency) && concurrency > 0
      ? Math.floor(concurrency)
      : DEFAULT_CONCURRENCY;

  const catalog = await loadClubsCatalog(
    clubsFile ? resolve(clubsFile) : undefined,
  );

  let selected: CatalogClub[];
  if (clubId) {
    const one = findCatalogClub(catalog, clubId);
    if (!one) {
      console.error(`Club id "${clubId}" not found in catalog (${catalog.length} clubs)`);
      process.exit(1);
    }
    selected = [one];
  } else if (all) {
    selected = catalog;
    if (!outPath && !quiet) {
      console.error(
        "Tip: use --out data/all-club-members.json (large JSON). clubs:padelstats:all sets this by default.",
      );
    }
  } else if (limit != null && Number.isFinite(limit)) {
    selected = catalog.slice(0, limit);
  } else {
    const one = findCatalogClub(catalog, DEFAULT_TEST_CLUB_ID);
    if (!one) {
      console.error(
        `No --club-id given and default test club ${DEFAULT_TEST_CLUB_ID} missing. Use --club-id <id> or --limit N`,
      );
      process.exit(1);
    }
    selected = [one];
    if (!quiet) {
      console.error(
        `No --club-id: using default test club ${one.name} (id ${one.id}). Pass --club-id or --limit to change.`,
      );
    }
  }

  if (!quiet) {
    console.error(
      `Processing ${selected.length} club(s) (${catalog.length} in catalog), concurrency ${poolSize}${delayMs > 0 ? `, stagger ${delayMs}ms` : ""}…`,
    );
  }

  const rows = await mapPool(
    selected,
    poolSize,
    async (catalogClub, index) => {
      if (delayMs > 0) await sleep(delayMs);
      const row = await syncOneClub(catalogClub, padelstatsId);
      logClubResult(index, selected.length, row, quiet);
      return row;
    },
  );

  const matched = rows.filter((r) => r.report != null).length;
  const totalMembers = rows.reduce(
    (sum, r) => sum + (r.report?.members.length ?? 0),
    0,
  );

  const summary = {
    processed: rows.length,
    matched,
    totalMembers,
    rows,
  };

  const unmatched = rows
    .filter((r) => !r.report)
    .map((r) => ({
      id: r.catalogClub.id,
      name: r.catalogClub.name,
      error: r.error ?? "no match",
    }));

  if (!quiet) {
    console.error(
      `\nDone: ${matched}/${rows.length} clubs with members, ${totalMembers} players total.`,
    );
    if (unmatched.length > 0) {
      console.error(`${unmatched.length} without roster:`);
      for (const u of unmatched.slice(0, 20)) {
        console.error(`  - ${u.name} (${u.id}): ${u.error}`);
      }
      if (unmatched.length > 20) {
        console.error(`  … and ${unmatched.length - 20} more`);
      }
    }
  }

  const json = JSON.stringify(summary, null, 2);

  if (outPath) {
    const abs = resolve(outPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, json, "utf8");
    if (!quiet) console.error(`Wrote ${abs}`);
  } else if (!quiet || rows.length <= 1) {
    console.log(json);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
