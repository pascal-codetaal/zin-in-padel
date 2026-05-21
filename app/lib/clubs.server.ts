import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Club } from "~/types/domain";

const CLUBS_PATH = path.join(
  process.cwd(),
  "data",
  "padelclubs_vlaanderen.json",
);

type RawClub = {
  id: string;
  naam: string;
  locatie: string;
  provincie: string;
  /** Aliases learned from external sources (e.g. Playtomic). Optional. */
  playtomicNames?: string[];
};

let cachedClubs: Club[] | null = null;

function mapRaw(raw: RawClub): Club {
  return {
    id: raw.id,
    name: raw.naam,
    city: raw.locatie,
    province: raw.provincie,
    playtomicNames: Array.isArray(raw.playtomicNames)
      ? raw.playtomicNames.filter((n): n is string => typeof n === "string")
      : undefined,
  };
}

async function readRawClubs(): Promise<RawClub[]> {
  const raw = JSON.parse(await readFile(CLUBS_PATH, "utf-8")) as RawClub[];
  return raw;
}

export async function loadClubs(): Promise<Club[]> {
  if (cachedClubs) return cachedClubs;
  const raw = await readRawClubs();
  cachedClubs = raw.map(mapRaw);
  return cachedClubs;
}

/** Force the in-memory cache to refresh on the next `loadClubs` call. */
function invalidateClubsCache(): void {
  cachedClubs = null;
}

export async function getClubById(id: string): Promise<Club | undefined> {
  const clubs = await loadClubs();
  return clubs.find((c) => c.id === id);
}

export async function getClubsByIds(ids: string[]): Promise<Club[]> {
  const clubs = await loadClubs();
  const set = new Set(ids);
  return clubs.filter((c) => set.has(c.id));
}

const MAX_SEARCH_RESULTS = 15;

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Search padel clubs in Vlaanderen by name, city, province, or a previously
 * learned Playtomic alias. Returns up to 15 results ordered by relevance.
 */
export async function searchClubs(query: string): Promise<Club[]> {
  const q = normalize(query);
  if (!q) return [];

  const clubs = await loadClubs();
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored = clubs
    .map((club) => {
      const aliasMatches = (club.playtomicNames ?? []).some((alias) => {
        const a = normalize(alias);
        return a === q || a.includes(q) || q.includes(a);
      });

      const haystack = `${club.name} ${club.city} ${club.province ?? ""}`.toLowerCase();
      const matchesAll = tokens.every((t) => haystack.includes(t));

      if (!aliasMatches && !matchesAll) return null;

      let score = 0;
      if (aliasMatches) score += 200; // strong signal — beats name match

      const nameLower = club.name.toLowerCase();
      const cityLower = club.city.toLowerCase();

      if (nameLower === q) score += 100;
      else if (nameLower.startsWith(q)) score += 50;
      else if (nameLower.includes(q)) score += 25;

      if (cityLower === q) score += 40;
      else if (cityLower.startsWith(q)) score += 20;
      else if (cityLower.includes(q)) score += 10;

      if (club.province?.toLowerCase().includes(q)) score += 5;

      return { club, score };
    })
    .filter((x): x is { club: Club; score: number } => x !== null);

  scored.sort(
    (a, b) => b.score - a.score || a.club.name.localeCompare(b.club.name),
  );

  return scored.slice(0, MAX_SEARCH_RESULTS).map((s) => s.club);
}

export function formatClubLine(club: Club, index: number): string {
  const place = club.province
    ? ` (${club.city}, ${club.province})`
    : ` (${club.city})`;
  return `${index}. ${club.name}${place}`;
}

/**
 * Compact list used as a fallback when a fuzzy paste (e.g. Playtomic name)
 * doesn't match by `searchClubs`. The agent gets the full catalog so it can
 * propose 2-3 candidates to the user.
 */
export async function loadAllClubsCompact(): Promise<
  { id: string; name: string; city: string; province?: string }[]
> {
  const clubs = await loadClubs();
  return clubs.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    province: c.province,
  }));
}

/**
 * Persist an external (e.g. Playtomic) name for a club so that next time the
 * exact string appears in a paste, `searchClubs` resolves it directly.
 */
export async function addPlaytomicAlias(
  clubId: string,
  alias: string,
): Promise<{ ok: true; club: Club } | { ok: false; error: string }> {
  const trimmed = alias.trim();
  if (!trimmed) return { ok: false, error: "alias_empty" };

  const raw = await readRawClubs();
  const idx = raw.findIndex((c) => c.id === clubId);
  if (idx < 0) return { ok: false, error: "club_not_found" };

  const existing = raw[idx]!.playtomicNames ?? [];
  if (
    !existing.some(
      (n) => normalize(n) === normalize(trimmed),
    )
  ) {
    raw[idx] = { ...raw[idx]!, playtomicNames: [...existing, trimmed] };
    await writeFile(CLUBS_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
    invalidateClubsCache();
  }

  const updatedClub = mapRaw(raw[idx]!);
  return { ok: true, club: updatedClub };
}
