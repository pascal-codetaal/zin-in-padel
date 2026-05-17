import { readFile } from "node:fs/promises";
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
};

let cachedClubs: Club[] | null = null;

function mapRaw(raw: RawClub): Club {
  return {
    id: raw.id,
    name: raw.naam,
    city: raw.locatie,
    province: raw.provincie,
  };
}

export async function loadClubs(): Promise<Club[]> {
  if (cachedClubs) return cachedClubs;
  const raw = JSON.parse(await readFile(CLUBS_PATH, "utf-8")) as RawClub[];
  cachedClubs = raw.map(mapRaw);
  return cachedClubs;
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

/**
 * Search padel clubs in Vlaanderen by name, city, or province.
 */
export async function searchClubs(query: string): Promise<Club[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const clubs = await loadClubs();
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored = clubs
    .map((club) => {
      const haystack = `${club.name} ${club.city} ${club.province ?? ""}`.toLowerCase();
      const matchesAll = tokens.every((t) => haystack.includes(t));
      if (!matchesAll) return null;

      let score = 0;
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

  scored.sort((a, b) => b.score - a.score || a.club.name.localeCompare(b.club.name));

  return scored.slice(0, MAX_SEARCH_RESULTS).map((s) => s.club);
}

export function formatClubLine(club: Club, index: number): string {
  const place = club.province ? ` (${club.city}, ${club.province})` : ` (${club.city})`;
  return `${index}. ${club.name}${place}`;
}
