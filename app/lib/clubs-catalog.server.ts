import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TvClub } from "~/lib/tennis-vlaanderen-api.server";

export type CatalogClub = {
  id: string;
  name: string;
  city: string;
};

const DEFAULT_CATALOG_PATH = resolve(process.cwd(), "data/clubs.json");

export function catalogClubToTvClub(club: CatalogClub): TvClub {
  return {
    clubId: club.id,
    name: club.name,
    city: club.city,
    clubNumber: club.id,
  };
}

export async function loadClubsCatalog(
  filePath = DEFAULT_CATALOG_PATH,
): Promise<CatalogClub[]> {
  const text = await readFile(filePath, "utf8");
  const raw = JSON.parse(text) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error(`Expected array in ${filePath}`);
  }

  const clubs: CatalogClub[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const name = String(o.name ?? "").trim();
    const city = String(o.city ?? "").trim();
    if (!id || !name) continue;
    clubs.push({ id, name, city });
  }
  return clubs;
}

export function findCatalogClub(
  clubs: CatalogClub[],
  clubId: string,
): CatalogClub | undefined {
  const norm = normalizeClubNumber(clubId);
  return clubs.find((c) => normalizeClubNumber(c.id) === norm);
}

/** Compare TV ids like "0230" with padelstats CLUBNR 230. */
export function normalizeClubNumber(value: string | number): string {
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? String(n) : String(value).trim();
}
