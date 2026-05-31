import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  loadClubsCatalog,
  normalizeClubNumber,
  type CatalogClub,
} from "~/lib/clubs-catalog.server";
import { prisma } from "~/lib/prisma.server";

export type TvClubledenMemberDto = {
  tvUserId: number;
  displayName: string;
  tennisSingles: string | null;
  tennisDoubles: string | null;
  padelRanking: string | null;
  gender: string | null;
};

export type TvClubMembersExportRow = {
  catalogClub: { id: string; name: string; city: string };
  padelstatsSearch: string;
  padelstatsClub: { id: number; clubNr: number; name: string } | null;
  tvClubId: number | null;
  tvClubName: string | null;
  reportedCount: number | null;
  members: TvClubledenMemberDto[];
  error?: string;
};

export type TvClubMembersExport = {
  processed: number;
  resolved: number;
  withRoster: number;
  totalMembers: number;
  padelOnly: boolean;
  rows: TvClubMembersExportRow[];
};

export type TvImportResult = {
  clubsCatalogImported: number;
  clubsTvLinked: number;
  clubsWithRoster: number;
  membersUpserted: number;
  membershipsWritten: number;
  exportErrors: number;
};

const DEFAULT_EXPORT_PATH = resolve(
  process.cwd(),
  "data/all-club-members-tv.json",
);

const CLUB_UPSERT_BATCH = 50;
const MEMBER_UPSERT_BATCH = 40;
const MEMBERSHIP_CREATE_BATCH = 1000;
const TX_OPTS = { maxWait: 15_000, timeout: 120_000 } as const;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function parseTvPadelRanking(raw: string | null): {
  currentRank: number;
  subCategory: string;
} {
  if (!raw?.trim()) return { currentRank: 0, subCategory: "" };
  const m = raw.trim().match(/^P(\d+)/i);
  const currentRank = m ? Number.parseInt(m[1]!, 10) : 0;
  const subCategory = raw.includes("*") ? "*" : "";
  return { currentRank: Number.isFinite(currentRank) ? currentRank : 0, subCategory };
}

export function normalizeTvGender(raw: string | null): string {
  const g = raw?.trim();
  if (!g) return "Onbekend";
  if (/^man$/i.test(g)) return "Man";
  if (/^vrouw$/i.test(g)) return "Vrouw";
  return g;
}

export async function loadTvClubMembersExport(
  filePath = DEFAULT_EXPORT_PATH,
): Promise<TvClubMembersExport> {
  const text = await readFile(filePath, "utf8");
  const data = JSON.parse(text) as TvClubMembersExport;
  if (!Array.isArray(data.rows)) {
    throw new Error("Invalid TV export: missing rows array");
  }
  return data;
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
  rows: TvClubMembersExportRow[],
  clubId?: string,
): TvClubMembersExportRow[] {
  if (!clubId) return rows;
  const want = normalizeClubNumber(clubId);
  return rows.filter((r) => normalizeClubNumber(r.catalogClub.id) === want);
}

type MemberRecord = {
  id: number;
  name: string;
  gender: string;
  padelRanking: string | null;
  currentRank: number;
  subCategory: string;
};

function memberDtoToRecord(m: TvClubledenMemberDto): MemberRecord {
  const { currentRank, subCategory } = parseTvPadelRanking(m.padelRanking);
  return {
    id: m.tvUserId,
    name: m.displayName.trim(),
    gender: normalizeTvGender(m.gender),
    padelRanking: m.padelRanking?.trim() || null,
    currentRank,
    subCategory,
  };
}

async function importClubsCatalog(options: {
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
          create: { id: club.id, name: club.name, city: club.city },
          update: { name: club.name, city: club.city },
        }),
      ),
      TX_OPTS,
    );
  }

  return catalog.length;
}

export async function importTvClubRosters(options: {
  export: TvClubMembersExport;
  clubsFile?: string;
  clubId?: string;
  dryRun?: boolean;
}): Promise<TvImportResult> {
  const { export: data, clubId, dryRun = false } = options;
  const now = new Date();

  const exportRows = filterExportRows(data.rows, clubId);
  const rosterRows = exportRows.filter((r) => r.members.length > 0 && !r.error);
  const linkRows = exportRows.filter((r) => r.tvClubId != null);

  const memberById = new Map<number, MemberRecord>();
  for (const row of rosterRows) {
    for (const m of row.members) {
      memberById.set(m.tvUserId, memberDtoToRecord(m));
    }
  }

  const clubsCatalogImported = await importClubsCatalog({
    clubsFile: options.clubsFile,
    clubId,
    dryRun,
  });

  const result: TvImportResult = {
    clubsCatalogImported,
    clubsTvLinked: linkRows.length,
    clubsWithRoster: rosterRows.length,
    membersUpserted: memberById.size,
    membershipsWritten: 0,
    exportErrors: exportRows.filter((r) => r.error).length,
  };

  if (dryRun) return result;

  for (const batch of chunk(linkRows, CLUB_UPSERT_BATCH)) {
    await prisma.$transaction(
      batch.map((row) =>
        prisma.club.update({
          where: { id: row.catalogClub.id },
          data: { tvClubId: row.tvClubId! },
        }),
      ),
      TX_OPTS,
    );
  }

  const uniqueMembers = [...memberById.values()];
  for (const batch of chunk(uniqueMembers, MEMBER_UPSERT_BATCH)) {
    await Promise.all(
      batch.map((m) =>
        prisma.tvMember.upsert({
          where: { id: m.id },
          create: {
            id: m.id,
            name: m.name,
            gender: m.gender,
            padelRanking: m.padelRanking,
            currentRank: m.currentRank,
            subCategory: m.subCategory,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            name: m.name,
            gender: m.gender,
            padelRanking: m.padelRanking,
            currentRank: m.currentRank,
            subCategory: m.subCategory,
            updatedAt: now,
          },
        }),
      ),
    );
  }

  for (const row of rosterRows) {
    const { catalogClub, members } = row;

    await prisma.club.update({
      where: { id: catalogClub.id },
      data: { tvSyncedAt: now },
    });

    await prisma.clubTvMembership.deleteMany({
      where: { clubId: catalogClub.id },
    });

    for (const batch of chunk(members, MEMBERSHIP_CREATE_BATCH)) {
      await prisma.clubTvMembership.createMany({
        data: batch.map((m) => ({
          clubId: catalogClub.id,
          tvMemberId: m.tvUserId,
          importedAt: now,
        })),
      });
    }

    result.membershipsWritten += members.length;
  }

  return result;
}
