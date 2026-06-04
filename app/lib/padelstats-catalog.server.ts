import { prisma } from "~/lib/prisma.server";
import {
  memberNameMatchesQuery,
  nameSearchTokens,
  normalizeForNameSearch,
} from "~/lib/padelstats-name-search.server";
import type { PadelstatsMemberHit } from "~/lib/padelstats-catalog.types";
import {
  MEMBER_SEARCH_LIMIT,
} from "~/lib/padelstats-member-search.shared";
import { formatPadelLevel, isPadelLevel, type PadelLevel } from "~/types/domain";
import { upsertTvMemberFromPadelstats } from "~/lib/tv-member-sync.server";

export type { PadelstatsMemberHit } from "~/lib/padelstats-catalog.types";
export {
  MEMBER_SEARCH_LIMIT,
  MEMBER_SEARCH_MIN_QUERY_LENGTH,
} from "~/lib/padelstats-member-search.shared";

function formatRank(rank: number, padelRanking: string | null): string {
  if (rank <= 0) return "";
  if (isPadelLevel(rank)) return formatPadelLevel(rank);
  return padelRanking?.trim() || `P${rank}`;
}

function toMemberHit(
  m: {
    id: number;
    name: string;
    gender: string;
    currentRank: number;
    padelRanking: string | null;
    clubMemberships: {
      clubId: string;
      club: { name: string };
    }[];
  },
): PadelstatsMemberHit {
  const membership = m.clubMemberships[0];
  const clubName = membership?.club.name ?? null;
  const rankLabel =
    formatRank(m.currentRank, m.padelRanking) || null;
  const parts = [m.name, rankLabel, clubName].filter(Boolean);
  return {
    id: m.id,
    name: m.name,
    gender: m.gender,
    currentRank: m.currentRank,
    clubId: membership?.clubId ?? null,
    clubName,
    rankLabel,
    label: parts.join(" · "),
  };
}

const memberSelect = {
  id: true,
  name: true,
  gender: true,
  currentRank: true,
  padelRanking: true,
  clubMemberships: {
    take: 1,
    select: {
      clubId: true,
      club: { select: { name: true } },
    },
  },
} as const;

const padelstatsMemberSelect = {
  id: true,
  name: true,
  gender: true,
  currentRank: true,
  subCategory: true,
  clubMemberships: {
    take: 1,
    select: {
      clubId: true,
      club: { select: { name: true } },
    },
  },
} as const;

function padelstatsRowToHit(
  m: {
    id: number;
    name: string;
    gender: string;
    currentRank: number;
    subCategory: string;
    clubMemberships: {
      clubId: string;
      club: { name: string };
    }[];
  },
): PadelstatsMemberHit {
  const padelRanking =
    m.currentRank > 0
      ? `P${m.currentRank}${m.subCategory.includes("*") ? "*" : ""}`
      : null;
  return toMemberHit({ ...m, padelRanking });
}

export async function searchPadelstatsMembers(
  query: string,
  limit = MEMBER_SEARCH_LIMIT,
): Promise<PadelstatsMemberHit[]> {
  const tokens = nameSearchTokens(query);
  if (tokens.length === 0) return [];

  const candidateCap = Math.min(120, limit * 10);
  const nameFilter = {
    AND: tokens.map((t) => ({
      name: { contains: t, mode: "insensitive" as const },
    })),
  };

  const [tvRows, psRows] = await Promise.all([
    prisma.tvMember.findMany({
      where: nameFilter,
      orderBy: { name: "asc" },
      take: candidateCap,
      select: memberSelect,
    }),
    prisma.padelstatsMember.findMany({
      where: nameFilter,
      orderBy: { name: "asc" },
      take: candidateCap,
      select: padelstatsMemberSelect,
    }),
  ]);

  const byName = new Map<string, PadelstatsMemberHit>();

  for (const row of tvRows) {
    if (!memberNameMatchesQuery(row.name, tokens)) continue;
    byName.set(normalizeForNameSearch(row.name), toMemberHit(row));
  }

  for (const row of psRows) {
    if (!memberNameMatchesQuery(row.name, tokens)) continue;
    const key = normalizeForNameSearch(row.name);
    if (byName.has(key)) continue;
    byName.set(key, padelstatsRowToHit(row));
  }

  return [...byName.values()].slice(0, limit);
}

export async function findPadelstatsMemberById(
  id: number,
): Promise<PadelstatsMemberHit | null> {
  const tv = await prisma.tvMember.findUnique({
    where: { id },
    select: memberSelect,
  });
  if (tv) return toMemberHit(tv);

  return upsertTvMemberFromPadelstats(id);
}

export function memberRankAsPadelLevel(rank: number): PadelLevel | null {
  return isPadelLevel(rank) ? rank : null;
}
