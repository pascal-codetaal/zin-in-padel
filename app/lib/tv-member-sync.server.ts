import type { PadelstatsMemberHit } from "~/lib/padelstats-catalog.types";
import { formatPadelLevel, isPadelLevel } from "~/types/domain";
import { prisma } from "~/lib/prisma.server";

function formatRank(rank: number, padelRanking: string | null): string | null {
  if (rank > 0 && isPadelLevel(rank)) return formatPadelLevel(rank);
  const raw = padelRanking?.trim();
  return raw || null;
}

export function padelstatsMemberToHit(
  m: {
    id: number;
    name: string;
    gender: string;
    currentRank: number;
    padelRanking?: string | null;
    clubMemberships: {
      clubId: string;
      club: { name: string };
    }[];
  },
): PadelstatsMemberHit {
  const membership = m.clubMemberships[0];
  const clubName = membership?.club.name ?? null;
  const rankLabel = formatRank(m.currentRank, m.padelRanking ?? null);
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

const memberWithClubSelect = {
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

/** Mirror a padelstats roster row into TvMember (+ optional club link) for search/waitlist. */
export async function upsertTvMemberFromPadelstats(
  padelstatsMemberId: number,
  now = new Date(),
): Promise<PadelstatsMemberHit | null> {
  const ps = await prisma.padelstatsMember.findUnique({
    where: { id: padelstatsMemberId },
    select: {
      id: true,
      name: true,
      gender: true,
      currentRank: true,
      subCategory: true,
      clubMemberships: {
        take: 1,
        select: { clubId: true, club: { select: { name: true } } },
      },
    },
  });
  if (!ps) return null;

  const padelRanking =
    ps.currentRank > 0
      ? `P${ps.currentRank}${ps.subCategory.includes("*") ? "*" : ""}`
      : null;

  await prisma.tvMember.upsert({
    where: { id: ps.id },
    create: {
      id: ps.id,
      name: ps.name,
      gender: ps.gender,
      padelRanking,
      currentRank: ps.currentRank,
      subCategory: ps.subCategory,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      name: ps.name,
      gender: ps.gender,
      padelRanking,
      currentRank: ps.currentRank,
      subCategory: ps.subCategory,
      updatedAt: now,
    },
  });

  const clubId = ps.clubMemberships[0]?.clubId;
  if (clubId) {
    await prisma.clubTvMembership.upsert({
      where: {
        clubId_tvMemberId: { clubId, tvMemberId: ps.id },
      },
      create: {
        clubId,
        tvMemberId: ps.id,
        importedAt: now,
      },
      update: { importedAt: now },
    });
  }

  return padelstatsMemberToHit({
    ...ps,
    padelRanking,
  });
}
