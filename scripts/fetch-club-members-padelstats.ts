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
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const DEFAULT_RETRY_CONCURRENCY = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_OUT = resolve(process.cwd(), "data/all-club-members.json");

type PadelstatsExport = {
  processed: number;
  matched: number;
  totalMembers: number;
  uniqueMembers: number;
  rows: ClubSyncRow[];
};

function summarizeExport(rows: ClubSyncRow[]): PadelstatsExport {
  const unique = new Set<number>();
  let totalMembers = 0;
  for (const row of rows) {
    for (const m of row.report?.members ?? []) {
      unique.add(m.id);
      totalMembers += 1;
    }
  }
  return {
    processed: rows.length,
    matched: rows.filter((r) => r.report && r.report.members.length > 0).length,
    totalMembers,
    uniqueMembers: unique.size,
    rows,
  };
}

async function loadPadelstatsExport(filePath: string): Promise<PadelstatsExport> {
  const text = await readFile(filePath, "utf8");
  const data = JSON.parse(text) as PadelstatsExport;
  if (!Array.isArray(data.rows)) {
    throw new Error(`Invalid export: missing rows in ${filePath}`);
  }
  return data;
}

function parseArgs(argv: string[]) {
  let clubId: string | null = null;
  let all = false;
  let retryErrors = false;
  let padelstatsId: number | null = null;
  let limit: number | null = null;
  let delayMs: number | null = null;
  let concurrency = DEFAULT_CONCURRENCY;
  let outPath: string | null = null;
  let quiet = false;
  let clubsFile: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--all") {
      all = true;
    } else if (arg === "--retry-errors") {
      retryErrors = true;
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
  --retry-errors          Re-fetch failed rows from --out and merge back
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
  pnpm clubs:padelstats:retry
  pnpm clubs:padelstats -- --all -j 12 -o data/all-club-members.json -q
`);
      process.exit(0);
    }
  }

  return {
    clubId,
    all,
    retryErrors,
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
  options: {
    padelstatsIdOverride: number | null;
    padelstatsClubHint: PadelstatsClubHit | null;
  },
): Promise<ClubSyncRow> {
  const { padelstatsIdOverride, padelstatsClubHint } = options;
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

    row.padelstatsClub =
      matchPadelstatsClub(tvClub, row.padelstatsCandidates) ??
      padelstatsClubHint;
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
    retryErrors,
    padelstatsId,
    limit,
    delayMs,
    concurrency,
    outPath,
    quiet,
    clubsFile,
  } = parseArgs(process.argv.slice(2));

  const targetOut = outPath ? resolve(outPath) : DEFAULT_OUT;
  const delayMsResolved =
    delayMs ?? (retryErrors ? DEFAULT_RETRY_DELAY_MS : 0);
  const poolSize =
    Number.isFinite(concurrency) && concurrency > 0
      ? Math.floor(concurrency)
      : retryErrors
        ? DEFAULT_RETRY_CONCURRENCY
        : DEFAULT_CONCURRENCY;

  const catalog = await loadClubsCatalog(
    clubsFile ? resolve(clubsFile) : undefined,
  );

  let existingExport: PadelstatsExport | null = null;
  const padelstatsByCatalogId = new Map<string, PadelstatsClubHit | null>();

  if (retryErrors) {
    existingExport = await loadPadelstatsExport(targetOut);
    const failed = existingExport.rows.filter((r) => r.error || !r.report);
    if (failed.length === 0) {
      console.error(`No failed rows in ${targetOut}; nothing to retry.`);
      process.exit(0);
    }
    for (const row of failed) {
      padelstatsByCatalogId.set(row.catalogClub.id, row.padelstatsClub);
    }
    console.error(`Retrying ${failed.length} clubs from ${targetOut}…`);
  }

  let selected: CatalogClub[];
  if (retryErrors && existingExport) {
    const failedIds = new Set(
      existingExport.rows
        .filter((r) => r.error || !r.report)
        .map((r) => r.catalogClub.id),
    );
    selected = catalog.filter((c) => failedIds.has(c.id));
    if (selected.length === 0) {
      console.error("Failed club ids not found in catalog.");
      process.exit(1);
    }
  } else if (clubId) {
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
      `Processing ${selected.length} club(s) (${catalog.length} in catalog), concurrency ${poolSize}${delayMsResolved > 0 ? `, stagger ${delayMsResolved}ms` : ""}…`,
    );
  }

  const rows = await mapPool(
    selected,
    poolSize,
    async (catalogClub, index) => {
      if (delayMsResolved > 0) await sleep(delayMsResolved);
      const row = await syncOneClub(catalogClub, {
        padelstatsIdOverride: padelstatsId,
        padelstatsClubHint: padelstatsByCatalogId.get(catalogClub.id) ?? null,
      });
      logClubResult(index, selected.length, row, quiet);
      return row;
    },
  );

  let exportRows = rows;
  if (retryErrors && existingExport) {
    const byCatalogId = new Map(rows.map((r) => [r.catalogClub.id, r]));
    exportRows = existingExport.rows.map(
      (r) => byCatalogId.get(r.catalogClub.id) ?? r,
    );
  }

  const summary = summarizeExport(exportRows);
  const unmatched = exportRows.filter((r) => !r.report);

  if (!quiet) {
    console.error(
      `\nDone: ${summary.matched}/${summary.processed} clubs with roster, ${summary.totalMembers} membership rows, ${summary.uniqueMembers} unique member ids.`,
    );
    if (unmatched.length > 0) {
      console.error(`${unmatched.length} without roster:`);
      for (const u of unmatched.slice(0, 20)) {
        console.error(
          `  - ${u.catalogClub.name} (${u.catalogClub.id}): ${u.error ?? "no match"}`,
        );
      }
      if (unmatched.length > 20) {
        console.error(`  … and ${unmatched.length - 20} more`);
      }
    }
  }

  const writeOut = retryErrors || all || outPath;
  if (writeOut) {
    await mkdir(dirname(targetOut), { recursive: true });
    await writeFile(
      targetOut,
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    if (!quiet) console.error(`Wrote ${targetOut}`);
  } else if (!quiet || exportRows.length <= 1) {
    console.log(JSON.stringify(summary, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
