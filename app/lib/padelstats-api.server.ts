/**
 * Public padelstats.be JSON API (no auth). Used for club search and member rosters.
 * https://padelstats.be/api/list_clubs?s=…
 * https://padelstats.be/api/get_club_report/{id}
 */

const PADELSTATS_API_BASE =
  process.env.PADELSTATS_API_BASE?.trim() || "https://padelstats.be/api";

export type PadelstatsClubHit = {
  id: number;
  name: string;
  clubNr: number;
  association: string;
  numMembers: number | null;
  searchStr: string;
};

export type PadelstatsMember = {
  id: number;
  name: string;
  club: string;
  gender: string;
  padel: {
    currentRank: number;
    predictedRank: number;
    subCategory: string;
  };
};

export type PadelstatsClubReport = {
  name: string;
  members: PadelstatsMember[];
  counter: { report: number };
};

type RawClubHit = {
  id?: number;
  name?: string;
  CLUBNR?: number;
  ASSOCIATION?: string;
  NUM_MEMBERS?: number;
  SEARCH_STR?: string;
};

type RawMember = {
  id?: number;
  name?: string;
  club?: string;
  gender?: string;
  padel?: {
    current_rank?: number;
    predicted_rank?: number;
    sub_category?: string;
  };
};

function normalizeSearchTerm(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return cleaned.slice(0, 8);
  // Prefer a distinctive token (skip generic padel/club words).
  const skip = new Set(["padel", "club", "padelclub", "tc", "tv"]);
  const distinctive = tokens.find((t) => !skip.has(t) && t.length >= 3);
  return (distinctive ?? tokens[0]!).slice(0, 24);
}

function normalizeClubNumber(value: string | number): string {
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? String(n) : String(value).trim();
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mapClubHit(row: RawClubHit): PadelstatsClubHit | null {
  if (row.id == null || !row.name?.trim()) return null;
  return {
    id: row.id,
    name: row.name.trim(),
    clubNr: row.CLUBNR ?? 0,
    association: row.ASSOCIATION?.trim() ?? "",
    numMembers:
      typeof row.NUM_MEMBERS === "number" ? row.NUM_MEMBERS : null,
    searchStr: row.SEARCH_STR?.trim() ?? "",
  };
}

function mapMember(row: RawMember): PadelstatsMember | null {
  if (row.id == null || !row.name?.trim()) return null;
  const padel = row.padel ?? {};
  return {
    id: row.id,
    name: row.name.trim(),
    club: row.club?.trim() ?? "",
    gender: row.gender?.trim() ?? "",
    padel: {
      currentRank: padel.current_rank ?? 0,
      predictedRank: padel.predicted_rank ?? 0,
      subCategory: padel.sub_category?.trim() ?? "",
    },
  };
}

export async function searchPadelstatsClubs(
  search: string,
): Promise<PadelstatsClubHit[]> {
  const s = search.trim();
  if (!s) return [];

  const url = new URL(`${PADELSTATS_API_BASE}/list_clubs`);
  url.searchParams.set("s", s);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      text.slice(0, 200) || `padelstats list_clubs failed (${res.status})`,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return [];
  }

  if (!Array.isArray(body)) return [];
  const hits: PadelstatsClubHit[] = [];
  for (const row of body as RawClubHit[]) {
    const mapped = mapClubHit(row);
    if (mapped) hits.push(mapped);
  }
  return hits;
}

export async function getPadelstatsClubReport(
  padelstatsClubId: number,
): Promise<PadelstatsClubReport> {
  const res = await fetch(
    `${PADELSTATS_API_BASE}/get_club_report/${padelstatsClubId}`,
    { headers: { Accept: "application/json" } },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      text.slice(0, 200) ||
        `padelstats get_club_report failed (${res.status})`,
    );
  }

  const body = JSON.parse(text) as {
    name?: string;
    members?: RawMember[];
    counter?: { report?: number };
  };

  const members: PadelstatsMember[] = [];
  for (const row of body.members ?? []) {
    const mapped = mapMember(row);
    if (mapped) members.push(mapped);
  }

  return {
    name: body.name?.trim() ?? "",
    members,
    counter: { report: body.counter?.report ?? 0 },
  };
}

/** Pick the best padelstats row for a Tennis Vlaanderen club. */
export function matchPadelstatsClub(
  tv: { name: string; city: string; clubNumber: string | null },
  hits: PadelstatsClubHit[],
): PadelstatsClubHit | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;

  const tvNr = tv.clubNumber?.trim();
  if (tvNr) {
    const tvNorm = normalizeClubNumber(tvNr);
    const byNr = hits.find(
      (h) => normalizeClubNumber(h.clubNr) === tvNorm,
    );
    if (byNr) return byNr;
  }

  const tvName = normalizeName(tv.name);
  const tvCity = normalizeName(tv.city);

  let best: PadelstatsClubHit | null = null;
  let bestScore = -1;

  for (const hit of hits) {
    let score = 0;
    const hitName = normalizeName(hit.name);
    const hitSearch = normalizeName(hit.searchStr);

    if (hitName === tvName) score += 100;
    else if (hitName.includes(tvName) || tvName.includes(hitName)) score += 40;
    else if (hitSearch.includes(tvName) || tvName.includes(hitSearch)) {
      score += 30;
    }

    if (tvCity && hitSearch.includes(tvCity)) score += 15;

    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }

  return bestScore >= 30 ? best : null;
}

/** Derive a short padelstats search string from a TV club name. */
export function padelstatsSearchTermFromClubName(clubName: string): string {
  return normalizeSearchTerm(clubName);
}
