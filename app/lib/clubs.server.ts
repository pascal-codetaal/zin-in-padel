import type { Club } from "~/types/domain";
import { prisma } from "~/lib/prisma.server";
import type { Prisma } from "@prisma/client";

type ClubRow = Prisma.ClubGetPayload<{ include: { playtomicAliases: true } }>;

function clubRowToDomain(row: ClubRow): Club {
  const aliases = row.playtomicAliases.map((a) => a.alias);
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    province: row.province ?? undefined,
    playtomicNames: aliases.length > 0 ? aliases : undefined,
  };
}

export async function loadClubs(): Promise<Club[]> {
  const rows = await prisma.club.findMany({
    include: { playtomicAliases: true },
  });
  return rows.map(clubRowToDomain);
}

export async function getClubById(id: string): Promise<Club | undefined> {
  const row = await prisma.club.findUnique({
    where: { id },
    include: { playtomicAliases: true },
  });
  return row ? clubRowToDomain(row) : undefined;
}

export async function getClubsByIds(ids: string[]): Promise<Club[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.club.findMany({
    where: { id: { in: ids } },
    include: { playtomicAliases: true },
  });
  return rows.map(clubRowToDomain);
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
  const rows = await prisma.club.findMany();
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    province: c.province ?? undefined,
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

  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) return { ok: false, error: "club_not_found" };

  const normalized = normalize(trimmed);
  const existing = await prisma.clubPlaytomicAlias.findFirst({
    where: { clubId, aliasNormalized: normalized },
  });
  if (!existing) {
    await prisma.clubPlaytomicAlias.create({
      data: { clubId, alias: trimmed, aliasNormalized: normalized },
    });
  }

  const updated = await prisma.club.findUniqueOrThrow({
    where: { id: clubId },
    include: { playtomicAliases: true },
  });
  return { ok: true, club: clubRowToDomain(updated) };
}
