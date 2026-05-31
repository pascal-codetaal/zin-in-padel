/**
 * Compare TV vs padelstats export files and explain coverage gaps.
 * Run: pnpm members:analyze
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const TV_PATH = resolve(process.cwd(), "data/all-club-members-tv.json");
const PS_PATH = resolve(process.cwd(), "data/all-club-members.json");

async function loadJson(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function main() {
  const tv = await loadJson(TV_PATH);
  const ps = await loadJson(PS_PATH);

  console.log("Member coverage analysis\n");

  if (tv && Array.isArray(tv.rows)) {
    const rows = tv.rows as Array<{
      members?: { tvUserId: number }[];
      reportedCount?: number | null;
      error?: string;
    }>;
    const unique = new Set<number>();
    let memberships = 0;
    let failed = 0;
    for (const r of rows) {
      if (r.error) failed += 1;
      for (const m of r.members ?? []) {
        unique.add(m.tvUserId);
        memberships += 1;
      }
    }
    console.log("TV export (all-club-members-tv.json):");
    console.log(`  padelOnly: ${String(tv.padelOnly ?? false)}`);
    console.log(`  unique members (tvUserId): ${tv.totalMembers ?? unique.size}`);
    console.log(`  membership rows (sum per club): ${memberships}`);
    console.log(`  clubs with errors: ${failed}`);
    console.log(
      `  recalc unique: ${unique.size}, memberships: ${memberships}\n`,
    );
  } else {
    console.log("TV export: not found\n");
  }

  if (ps && Array.isArray(ps.rows)) {
    const rows = ps.rows as Array<{
      report?: { members: { id: number }[] } | null;
      error?: string;
    }>;
    const unique = new Set<number>();
    let memberships = 0;
    let failed = 0;
    for (const r of rows) {
      if (r.error || !r.report) failed += 1;
      for (const m of r.report?.members ?? []) {
        unique.add(m.id);
        memberships += 1;
      }
    }
    console.log("Padelstats export (all-club-members.json):");
    console.log(`  unique members (padelstats id): ${ps.uniqueMembers ?? unique.size}`);
    console.log(`  membership rows: ${ps.totalMembers ?? memberships}`);
    console.log(`  clubs with roster: ${ps.matched ?? "?"}`);
    console.log(`  clubs failed / no roster: ${failed}`);
    console.log(
      `  recalc unique: ${unique.size}, memberships: ${memberships}\n`,
    );
  } else {
    console.log("Padelstats export: not found\n");
  }

  if (tv && ps) {
    const tvU = Number(tv.totalMembers ?? 0);
    const tvM = (tv.rows as { members?: unknown[] }[]).reduce(
      (s, r) => s + (r.members?.length ?? 0),
      0,
    );
    const psM = Number(ps.totalMembers ?? 0);
    console.log("Targets:");
    console.log(
      `  If you expect ~214551 total membership rows: TV file has ${tvM}, padelstats adds more after retry.`,
    );
    console.log(
      `  If you expect ~214551 unique people: that needs full TV fetch + padelstats retry + deduping across sources.`,
    );
    console.log(
      `  Current TV unique (${tvU}) is below 214551 — run pnpm clubs:padelstats:retry then import both.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
