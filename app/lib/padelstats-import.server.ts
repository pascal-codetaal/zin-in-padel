import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  loadClubsCatalog,
  normalizeClubNumber,
  type CatalogClub,
} from "~/lib/clubs-catalog.server";
import type { PadelstatsMember as PadelstatsMemberDto } from "~/lib/padelstats-api.server";
import { prisma } from "~/lib/prisma.server";
import { upsertTvMemberFromPadelstats } from "~/lib/tv-member-sync.server";

export type ClubMembersExportRow = {
  catalogClub: { id: string; name: string; city: string };
  padelstatsClub: { id: number; clubNr: number; name: string } | null;
  report: { name: string; members: PadelstatsMemberDto[] } | null;
  error?: string;
};

export type ClubMembersExport = {
  processed: number;
  matched: number;
  totalMembers: number;
  rows: ClubMembersExportRow[];
};

export type PadelstatsImportResult = {
  /** All clubs from data/clubs.json upserted into Club. */
  clubsCatalogImported: number;
  /** Clubs that received a padelstatsClubId from the export (with or without roster). */
  clubsPadelstatsLinked: number;
  /** Clubs with a roster imported this run. */
  clubsWithRoster: number;
  clubsWithoutRoster: number;
  membersUpserted: number;
  membershipsWritten: number;
};

const DEFAULT_EXPORT_PATH = resolve(
  process.cwd(),
  "data/all-club-members.json",
);

const CLUB_UPSERT_BATCH = 50;
/** Parallel upserts per chunk (no interactive transaction — avoids 5s Prisma tx timeout). */
const MEMBER_UPSERT_BATCH = 25;
const MEMBERSHIP_CREATE_BATCH = 500;

const TX_OPTS = { maxWait: 15_000, timeout: 120_000 } as const;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function loadClubMembersExport(
  filePath = DEFAULT_EXPORT_PATH,
): Promise<ClubMembersExport> {
  const text = await readFile(filePath, "utf8");
  const data = JSON.parse(text) as ClubMembersExport;
  if (!Array.isArray(data.rows)) {
    throw new Error("Invalid export: missing rows array");
  }
  return data;
}

function memberToDb(m: PadelstatsMemberDto, now: Date) {
  return {
    id: m.id,
    name: m.name,
    gender: m.gender,
    currentRank: m.padel.currentRank,
    predictedRank: m.padel.predictedRank,
    subCategory: m.padel.subCategory,
    createdAt: now,
    updatedAt: now,
  };
}

function filterCatalogByClubId(
  clubs: CatalogClub[],
  clubId?: string,
): CatalogClub[] {
  if (!clubId) return clubs;
  const want = normalizeClubNumber(clubId);
  const found = clubs.filter((c) => normalizeClubNumber(c.id) === want);
  if (found.length === 0) {
    throw new Error(`Club id ${clubId} not found in data/clubs.json`);
  }
  return found;
}

function filterExportRows(
  rows: ClubMembersExportRow[],
  clubId?: string,
): ClubMembersExportRow[] {
  if (!clubId) return rows;
  const want = normalizeClubNumber(clubId);
  return rows.filter((r) => normalizeClubNumber(r.catalogClub.id) === want);
}

/** Upsert every club from data/clubs.json into the Club table. */
export async function importClubsCatalog(options: {
  clubsFile?: string;
  clubId?: string;
  dryRun?: boolean;
}): Promise<number> {
  const catalog = filterCatalogByClubId(
    await loadClubsCatalog(options.clubsFile),
    options.clubId,
  );

  if (options.dryRun) return catalog.length;

  for (const batch of chunk(catalog, CLUB_UPSERT_BATCH)) {
    await prisma.$transaction(
      batch.map((club) =>
        prisma.club.upsert({
          where: { id: club.id },
          create: {
            id: club.id,
            name: club.name,
            city: club.city,
          },
          update: {
            name: club.name,
            city: club.city,
          },
        }),
      ),
      TX_OPTS,
    );
  }

  return catalog.length;
}

export async function importPadelstatsRosters(options: {
  export: ClubMembersExport;
  clubsFile?: string;
  clubId?: string;
  dryRun?: boolean;
}): Promise<PadelstatsImportResult> {
  const { export: data, clubId, dryRun = false } = options;
  const now = new Date();

  const exportRows = filterExportRows(data.rows, clubId);
  const rosterRows = exportRows.filter(
    (r) => r.report && r.report.members.length > 0,
  );
  const linkRows = exportRows.filter((r) => r.padelstatsClub != null);

  const memberById = new Map<number, PadelstatsMemberDto>();
  for (const row of rosterRows) {
    for (const m of row.report!.members) {
      memberById.set(m.id, m);
    }
  }

  const clubsCatalogImported = await importClubsCatalog({
    clubsFile: options.clubsFile,
    clubId,
    dryRun,
  });

  const result: PadelstatsImportResult = {
    clubsCatalogImported,
    clubsPadelstatsLinked: linkRows.length,
    clubsWithRoster: rosterRows.length,
    clubsWithoutRoster: exportRows.length - rosterRows.length,
    membersUpserted: memberById.size,
    membershipsWritten: 0,
  };

  if (dryRun) return result;

  for (const batch of chunk(linkRows, CLUB_UPSERT_BATCH)) {
    await prisma.$transaction(
      batch.map((row) =>
        prisma.club.update({
          where: { id: row.catalogClub.id },
          data: { padelstatsClubId: row.padelstatsClub!.id },
        }),
      ),
      TX_OPTS,
    );
  }

  const uniqueMembers = [...memberById.values()];
  for (const batch of chunk(uniqueMembers, MEMBER_UPSERT_BATCH)) {
    await Promise.all(
      batch.map((m) =>
        prisma.padelstatsMember.upsert({
          where: { id: m.id },
          create: memberToDb(m, now),
          update: {
            name: m.name,
            gender: m.gender,
            currentRank: m.padel.currentRank,
            predictedRank: m.padel.predictedRank,
            subCategory: m.padel.subCategory,
            updatedAt: now,
          },
        }),
      ),
    );
  }

  for (const batch of chunk(uniqueMembers, MEMBER_UPSERT_BATCH)) {
    await Promise.all(
      batch.map((m) => upsertTvMemberFromPadelstats(m.id, now)),
    );
  }

  for (const row of rosterRows) {
    const { catalogClub, report } = row;
    const members = report!.members;

    await prisma.club.update({
      where: { id: catalogClub.id },
      data: { padelstatsSyncedAt: now },
    });

    await prisma.clubPadelstatsMembership.deleteMany({
      where: { clubId: catalogClub.id },
    });

    for (const batch of chunk(members, MEMBERSHIP_CREATE_BATCH)) {
      await prisma.clubPadelstatsMembership.createMany({
        data: batch.map((m) => ({
          clubId: catalogClub.id,
          padelstatsMemberId: m.id,
          importedAt: now,
        })),
      });
    }

    result.membershipsWritten += members.length;
  }

  return result;
}
