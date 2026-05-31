/**
 * Fetch club rosters from Tennis & Padel Vlaanderen clubdashboard (HTML).
 *
 * Important: `clubId` in the TV URL is the internal club id (same as padelstats `id`),
 * NOT the matricule in data/clubs.json. This script resolves it via padelstats search.
 *
 * Run:
 *   pnpm clubs:tv:test              # Racing Wetteren (catalog 8041 → TV 2202)
 *   pnpm clubs:tv:all               # all catalog clubs → data/all-club-members-tv.json
 *   pnpm clubs:tv -- --club-id 8041
 *   pnpm clubs:tv:retry             # re-fetch failed rows in data/all-club-members-tv.json
 *   pnpm clubs:tv -- --tv-club-id 2202   # skip padelstats lookup
 */
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  findCatalogClub,
  loadClubsCatalog,
  type CatalogClub,
} from "../app/lib/clubs-catalog.server";
import type { PadelstatsClubHit } from "../app/lib/padelstats-api.server";
import {
  fetchTvClubledenRoster,
  resolveTvClubDashboardId,
  type TvClubledenMember,
} from "../app/lib/tv-clubleden.server";

export type TvClubMembersExportRow = {
  catalogClub: { id: string; name: string; city: string };
  padelstatsSearch: string;
  padelstatsClub: PadelstatsClubHit | null;
  tvClubId: number | null;
  tvClubName: string | null;
  reportedCount: number | null;
  members: TvClubledenMember[];
  error?: string;
};

export type TvClubMembersExport = {
  processed: number;
  resolved: number;
  withRoster: number;
  totalMembers: number;
  padelOnly: boolean;
  rows: TvClubMembersExportRow[];
};

const DEFAULT_TEST_CATALOG_ID = "8041"; // Racing Wetteren (TV clubId 2202)
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DELAY_MS = 800;
const DEFAULT_ALL_DELAY_MS = 1200;
const DEFAULT_RETRY_DELAY_MS = 3000;
const DEFAULT_OUT = resolve(process.cwd(), "data/all-club-members-tv.json");

async function loadTvExport(filePath: string): Promise<TvClubMembersExport> {
  const text = await readFile(filePath, "utf8");
  const data = JSON.parse(text) as TvClubMembersExport;
  if (!Array.isArray(data.rows)) {
    throw new Error(`Invalid export: missing rows in ${filePath}`);
  }
  return data;
}

function summarizeExport(rows: TvClubMembersExportRow[], padelOnly: boolean): TvClubMembersExport {
  const uniqueMembers = new Set<number>();
  for (const row of rows) {
    for (const m of row.members) uniqueMembers.add(m.tvUserId);
  }
  return {
    processed: rows.length,
    resolved: rows.filter((r) => r.tvClubId != null).length,
    withRoster: rows.filter((r) => r.members.length > 0).length,
    totalMembers: uniqueMembers.size,
    padelOnly,
    rows,
  };
}

function parseArgs(argv: string[]) {
  let clubId: string | null = null;
  let tvClubId: number | null = null;
  let all = false;
  let limit: number | null = null;
  let delayMs: number | null = null;
  let concurrency = DEFAULT_CONCURRENCY;
  let outPath: string | null = null;
  let quiet = false;
  let clubsFile: string | null = null;
  let padelOnly = false;
  let retryErrors = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--all") all = true;
    else if (arg === "--retry-errors") retryErrors = true;
    else if (arg === "--padel-only") padelOnly = true;
    else if (arg === "--concurrency" || arg === "-j") {
      concurrency = Number(argv[++i]);
    } else if (arg === "--club-id") clubId = argv[++i] ?? null;
    else if (arg === "--tv-club-id") tvClubId = Number(argv[++i]);
    else if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg === "--delay") delayMs = Number(argv[++i]);
    else if (arg === "--out" || arg === "-o") outPath = argv[++i] ?? null;
    else if (arg === "--clubs-file") clubsFile = argv[++i] ?? null;
    else if (arg === "--quiet" || arg === "-q") quiet = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: tsx scripts/fetch-club-members-tv.ts [options]

Options:
  --all                 Every club in data/clubs.json
  --retry-errors        Re-fetch rows with error from --out JSON and merge back
  --club-id <matricule> Catalog club (TV matricule / CLUBNR)
  --tv-club-id <id>     TV dashboard clubId (skips padelstats lookup)
  --padel-only          Keep members with a P-ranking only
  --limit <n>           First n clubs from catalog
  --delay <ms>          Stagger between club starts (default 800; --all: 1200)
  --concurrency, -j     Parallel fetches (default ${DEFAULT_CONCURRENCY})
  --out, -o <path>      JSON output path
  --quiet, -q           Suppress per-club lines (summary still prints)

Note: catalog id (e.g. 2202 = WATEWY) ≠ TV clubId (WATEWY → 1414660).
      Use --tv-club-id only when you know the dashboard id.
`);
      process.exit(0);
    }
  }

  return {
    clubId,
    tvClubId,
    all,
    limit,
    delayMs,
    concurrency,
    outPath,
    quiet,
    clubsFile,
    padelOnly,
    retryErrors,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function syncOneClub(
  catalogClub: CatalogClub,
  options: {
    tvClubIdOverride: number | null;
    padelOnly: boolean;
    padelstatsClubHint?: PadelstatsClubHit | null;
  },
): Promise<TvClubMembersExportRow> {
  const resolution = await resolveTvClubDashboardId(
    catalogClub,
    options.tvClubIdOverride,
  );

  const row: TvClubMembersExportRow = {
    catalogClub,
    padelstatsSearch: resolution.padelstatsSearch,
    padelstatsClub:
      resolution.padelstatsClub ?? options.padelstatsClubHint ?? null,
    tvClubId: resolution.tvClubId ?? options.tvClubIdOverride,
    tvClubName: null,
    reportedCount: null,
    members: [],
  };

  if (resolution.error) {
    row.error = resolution.error;
    return row;
  }
  if (row.tvClubId == null) {
    row.error = "no TV clubId";
    return row;
  }

  try {
    const roster = await fetchTvClubledenRoster(row.tvClubId, {
      padelOnly: options.padelOnly,
    });
    row.tvClubName = roster.clubName;
    row.reportedCount = roster.reportedCount;
    row.members = roster.members;
    if (
      roster.reportedCount != null &&
      roster.members.length !== roster.reportedCount &&
      !options.padelOnly
    ) {
      row.error = `parsed ${roster.members.length} rows, page says ${roster.reportedCount}`;
    }
  } catch (err) {
    row.error = err instanceof Error ? err.message : String(err);
  }

  return row;
}

function logRow(
  index: number,
  total: number,
  row: TvClubMembersExportRow,
  quiet: boolean,
): void {
  if (quiet) return;
  const n = row.members.length;
  const status = row.error
    ? `✗ ${row.error}`
    : row.tvClubId
      ? `✓ tv ${row.tvClubId} (${n} members)`
      : "✗ no tv clubId";
  const map =
    row.padelstatsClub && row.padelstatsClub.clubNr !== Number(row.catalogClub.id)
      ? ` — matricule ${row.catalogClub.id} → tv ${row.tvClubId}`
      : row.tvClubId
        ? ` — tv ${row.tvClubId}`
        : "";
  console.error(
    `[${index + 1}/${total}] ${row.catalogClub.name} (id ${row.catalogClub.id}) ${status}${map}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const {
    clubId,
    tvClubId: tvClubIdGlobal,
    all,
    limit,
    delayMs,
    concurrency,
    outPath,
    quiet,
    clubsFile,
    retryErrors,
  } = args;
  let padelOnly = args.padelOnly;

  const targetOut = outPath ? resolve(outPath) : DEFAULT_OUT;

  const delayMsResolved =
    delayMs ??
    (retryErrors
      ? DEFAULT_RETRY_DELAY_MS
      : all
        ? DEFAULT_ALL_DELAY_MS
        : DEFAULT_DELAY_MS);

  const poolSizeDefault = retryErrors ? 1 : DEFAULT_CONCURRENCY;

  const poolSize =
    Number.isFinite(concurrency) && concurrency > 0
      ? Math.floor(concurrency)
      : poolSizeDefault;

  const catalog = await loadClubsCatalog(
    clubsFile ? resolve(clubsFile) : undefined,
  );

  let existingExport: TvClubMembersExport | null = null;
  let tvIdByCatalogId = new Map<string, number | null>();
  let padelstatsByCatalogId = new Map<string, PadelstatsClubHit | null>();

  if (retryErrors) {
    existingExport = await loadTvExport(targetOut);
    if (!padelOnly) padelOnly = existingExport.padelOnly;
    const failed = existingExport.rows.filter((r) => r.error);
    if (failed.length === 0) {
      console.error(`No errors in ${targetOut}; nothing to retry.`);
      process.exit(0);
    }
    for (const row of failed) {
      tvIdByCatalogId.set(row.catalogClub.id, row.tvClubId);
      padelstatsByCatalogId.set(row.catalogClub.id, row.padelstatsClub);
    }
    console.error(`Retrying ${failed.length} failed clubs from ${targetOut}…`);
  }

  let selected: CatalogClub[];
  if (retryErrors && existingExport) {
    const failedIds = new Set(
      existingExport.rows.filter((r) => r.error).map((r) => r.catalogClub.id),
    );
    selected = catalog.filter((c) => failedIds.has(c.id));
    if (selected.length === 0) {
      console.error("Failed club ids not found in catalog.");
      process.exit(1);
    }
  } else if (clubId) {
    const one = findCatalogClub(catalog, clubId);
    if (!one) {
      console.error(`Club id "${clubId}" not found in catalog`);
      process.exit(1);
    }
    selected = [one];
  } else if (all) {
    selected = catalog;
  } else if (limit != null && Number.isFinite(limit)) {
    selected = catalog.slice(0, limit);
  } else {
    const one = findCatalogClub(catalog, DEFAULT_TEST_CATALOG_ID);
    if (!one) {
      console.error(`Default test club ${DEFAULT_TEST_CATALOG_ID} missing`);
      process.exit(1);
    }
    selected = [one];
    if (!quiet) {
      console.error(
        `Default: ${one.name} (catalog id ${one.id}). Use --club-id or --all.`,
      );
    }
  }

  console.error(
    `TV clubleden: ${selected.length} clubs (concurrency ${poolSize}, delay ${delayMsResolved}ms${padelOnly ? ", padel-only" : ""})…`,
  );

  const rows = await mapPool(selected, poolSize, async (club, index) => {
    if (delayMsResolved > 0) await sleep(delayMsResolved * (index % poolSize));
    const row = await syncOneClub(club, {
      tvClubIdOverride:
        selected.length === 1 && tvClubIdGlobal != null
          ? tvClubIdGlobal
          : (tvIdByCatalogId.get(club.id) ?? null),
      padelOnly,
      padelstatsClubHint: padelstatsByCatalogId.get(club.id) ?? null,
    });
    logRow(index, selected.length, row, quiet);
    return row;
  });

  let exportRows = rows;
  if (retryErrors && existingExport) {
    const byCatalogId = new Map(rows.map((r) => [r.catalogClub.id, r]));
    exportRows = existingExport.rows.map(
      (r) => byCatalogId.get(r.catalogClub.id) ?? r,
    );
  }

  const exportDoc = summarizeExport(exportRows, padelOnly);

  const failed = exportDoc.rows.filter((r) => r.error).length;
  const retriedOk = retryErrors
    ? rows.filter((r) => !r.error && r.members.length > 0).length
    : 0;
  const summary = [
    `Done: ${exportDoc.withRoster}/${exportDoc.processed} rosters`,
    `${exportDoc.totalMembers} unique members`,
    exportDoc.resolved + " TV club ids resolved",
    failed > 0 ? `${failed} errors` : null,
    retryErrors && retriedOk > 0 ? `${retriedOk}/${rows.length} retries OK` : null,
    padelOnly ? "(padel-only)" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const target =
    retryErrors || all || outPath ? targetOut : null;
  if (target) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(exportDoc, null, 2)}\n`, "utf8");
    console.error(`${summary}\nWrote ${target}`);
  } else if (!quiet) {
    console.log(JSON.stringify(exportDoc, null, 2));
    console.error(summary);
  } else {
    console.error(summary);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
