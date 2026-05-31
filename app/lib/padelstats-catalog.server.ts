import { prisma } from "~/lib/prisma.server";
import type { PadelstatsMemberHit } from "~/lib/padelstats-catalog.types";
import {
  memberNameMatchesQuery,
  nameSearchTokens,
} from "~/lib/padelstats-name-search.server";
import { MEMBER_SEARCH_LIMIT } from "~/lib/padelstats-member-search.shared";
import { formatPadelLevel, isPadelLevel, type PadelLevel } from "~/types/domain";

export type { PadelstatsMemberHit } from "~/lib/padelstats-catalog.types";
export {
  MEMBER_SEARCH_LIMIT,
  MEMBER_SEARCH_MIN_QUERY_LENGTH,
} from "~/lib/padelstats-member-search.shared";

function formatRank(rank: number): string {
  if (rank <= 0) return "";
  if (isPadelLevel(rank)) return formatPadelLevel(rank);
  return `P${rank}`;
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
    formatRank(m.currentRank) || m.padelRanking?.trim() || null;
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

export async function searchPadelstatsMembers(
  query: string,
  limit = MEMBER_SEARCH_LIMIT,
): Promise<PadelstatsMemberHit[]> {
  const tokens = nameSearchTokens(query);
  if (tokens.length === 0) return [];

  const candidateCap = Math.min(80, limit * 8);

  const rows = await prisma.tvMember.findMany({
    where: {
      AND: tokens.map((t) => ({
        name: { contains: t, mode: "insensitive" as const },
      })),
    },
    orderBy: { name: "asc" },
    take: candidateCap,
    select: memberSelect,
  });

  const hits: PadelstatsMemberHit[] = [];
  for (const row of rows) {
    if (!memberNameMatchesQuery(row.name, tokens)) continue;
    hits.push(toMemberHit(row));
    if (hits.length >= limit) break;
  }

  return hits;
}

export async function findPadelstatsMemberById(
  id: number,
): Promise<PadelstatsMemberHit | null> {
  const m = await prisma.tvMember.findUnique({
    where: { id },
    select: memberSelect,
  });
  if (!m) return null;
  return toMemberHit(m);
}

export function memberRankAsPadelLevel(rank: number): PadelLevel | null {
  return isPadelLevel(rank) ? rank : null;
}
