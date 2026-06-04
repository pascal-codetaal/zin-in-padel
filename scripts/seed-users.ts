/**
 * Seed 100 Belgian test users with complete profiles and mutual maatjes links.
 *
 * Run: npx tsx scripts/seed-users.ts
 * Remove: npx tsx scripts/seed-users.ts --cleanup
 */
import "dotenv/config";
import { prisma } from "../app/lib/prisma.server";
import { createManageToken } from "../app/lib/vrienden-url.server";
import {
  levelsForGender,
  stepLevel,
  type Gender,
  type MatchPreference,
  type PadelLevel,
  type PreferredSide,
} from "../app/types/domain";

const SEED_COUNT = 100;
const SEED_PHONE_BASE = 32490000000; // +32490000001 … +32490000100
const SEED_WA_PREFIX = "seed-";

const FIRST_NAMES_M = [
  "Jan",
  "Pieter",
  "Tom",
  "Lucas",
  "Wout",
  "Bram",
  "Joris",
  "Niels",
  "Stijn",
  "Koen",
  "Maarten",
  "Ruben",
  "Dries",
  "Jens",
  "Tim",
  "Robin",
  "Sven",
  "Yannick",
  "Arne",
  "Gilles",
];
const FIRST_NAMES_W = [
  "Emma",
  "Lotte",
  "Julie",
  "Sarah",
  "Laura",
  "Charlotte",
  "Eline",
  "Femke",
  "An",
  "Sofie",
  "Hanne",
  "Lien",
  "Nathalie",
  "Amber",
  "Lisa",
  "Eva",
  "Marie",
  "Elise",
  "Noor",
  "Fien",
];
const LAST_NAMES = [
  "Peeters",
  "Janssens",
  "Maes",
  "Jacobs",
  "Willems",
  "Claes",
  "Goossens",
  "Wouters",
  "De Smet",
  "Mertens",
  "Dubois",
  "Lambert",
  "Martens",
  "Hendrickx",
  "Leclercq",
  "Vandamme",
  "Desmet",
  "Van den Berg",
  "Verbeeck",
  "Coppens",
  "Declercq",
  "Vermeulen",
  "Baert",
  "De Vries",
  "Smets",
];

const MATCH_PREFERENCES: MatchPreference[] = [
  "friends_only",
  "level_only",
  "open",
];
const SIDES: PreferredSide[] = ["left", "right"];

const GENT_CLUB_IDS = [
  "garrincha-gent-gent",
  "padel-4u2-gent-gentbrugge",
  "gantoise-gent",
  "padel-9000-sint-amandsberg-gent",
];
const ANTWERP_CLUB_IDS = [
  "hangar-padel-club-beveren-waas",
  "garrincha-antwerpen-noord-antwerpen",
  "garrincha-zuid-hoboken-antwerpen",
];
const BRUGGE_CLUB_IDS = [
  "arenal-brugge-sint-kruis-brugge",
  "brughia-sint-kruis-brugge",
  "hercull-rooftop-padel-brugge-sint-andries",
];

function pick<T>(arr: readonly T[], index: number): T {
  return arr[index % arr.length]!;
}

function phoneForIndex(i: number): string {
  return `+${SEED_PHONE_BASE + i + 1}`;
}

function waIdForIndex(i: number): string {
  return `${SEED_WA_PREFIX}${SEED_PHONE_BASE + i + 1}`;
}

function profileNameForIndex(i: number, gender: Gender): string {
  const first =
    gender === "m"
      ? pick(FIRST_NAMES_M, i)
      : pick(FIRST_NAMES_W, i + 7);
  const last = pick(LAST_NAMES, i * 3 + (gender === "m" ? 0 : 11));
  return `${first} ${last}`;
}

function levelForIndex(i: number, gender: Gender): PadelLevel {
  const ladder = levelsForGender(gender);
  return ladder[i % ladder.length]!;
}

function clubIdsForIndex(i: number): string[] {
  const pool =
    i % 3 === 0
      ? GENT_CLUB_IDS
      : i % 3 === 1
        ? ANTWERP_CLUB_IDS
        : BRUGGE_CLUB_IDS;
  const count = 1 + (i % 3);
  const ids: string[] = [];
  for (let j = 0; j < count; j++) {
    const id = pick(pool, i + j * 2);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function favoriteIndicesFor(i: number): number[] {
  const offsets = [1, 2, 3, 5, 7, 11, 17, 23];
  return offsets.map((o) => (i + o) % SEED_COUNT);
}

type SeedUserSpec = {
  index: number;
  id: string;
  manageToken: string;
  waId: string;
  phone: string;
  profileName: string;
  gender: Gender;
  level: PadelLevel;
  preferredSide: PreferredSide;
  playsBothSides: boolean;
  matchPreference: MatchPreference;
  matchLevelMin: number | null;
  matchLevelMax: number | null;
  preferredClubIds: string[];
  favoriteIndices: number[];
};

function buildSpecs(): SeedUserSpec[] {
  const specs: SeedUserSpec[] = [];
  for (let i = 0; i < SEED_COUNT; i++) {
    const gender: Gender = i % 3 === 0 ? "w" : "m";
    const level = levelForIndex(i, gender);
    const matchPreference = pick(MATCH_PREFERENCES, i);
    let matchLevelMin: number | null = null;
    let matchLevelMax: number | null = null;
    if (matchPreference === "level_only") {
      matchLevelMin = stepLevel(level, "down", gender);
      matchLevelMax = stepLevel(level, "up", gender);
    } else if (matchPreference === "open") {
      matchLevelMin = null;
      matchLevelMax = null;
    }

    specs.push({
      index: i,
      id: crypto.randomUUID(),
      manageToken: createManageToken(),
      waId: waIdForIndex(i),
      phone: `whatsapp:${phoneForIndex(i)}`,
      profileName: profileNameForIndex(i, gender),
      gender,
      level,
      preferredSide: pick(SIDES, i),
      playsBothSides: i % 4 === 0,
      matchPreference,
      matchLevelMin,
      matchLevelMax,
      preferredClubIds: clubIdsForIndex(i),
      favoriteIndices: favoriteIndicesFor(i),
    });
  }
  return specs;
}

async function resolveClubIds(requested: string[]): Promise<string[]> {
  const rows = await prisma.club.findMany({
    where: { id: { in: requested } },
    select: { id: true },
  });
  const found = new Set(rows.map((r) => r.id));
  const missing = requested.filter((id) => !found.has(id));
  if (missing.length === 0) return requested;

  const fallback = await prisma.club.findMany({
    take: 20,
    orderBy: { city: "asc" },
    select: { id: true },
  });
  const fallbackIds = fallback.map((r) => r.id);
  const resolved = [...requested.filter((id) => found.has(id))];
  for (const id of missing) {
    const substitute = fallbackIds[resolved.length % fallbackIds.length];
    if (substitute && !resolved.includes(substitute)) resolved.push(substitute);
  }
  if (resolved.length === 0 && fallbackIds[0]) resolved.push(fallbackIds[0]);
  return resolved;
}

async function seed(): Promise<void> {
  const existing = await prisma.user.count({
    where: { waId: { startsWith: SEED_WA_PREFIX } },
  });
  if (existing > 0) {
    console.error(
      `Found ${existing} existing seed users (waId prefix "${SEED_WA_PREFIX}").`,
    );
    console.error("Run with --cleanup first, or delete them manually.");
    process.exit(1);
  }

  const specs = buildSpecs();
  const now = new Date();

  const clubIdCache = new Map<string, string[]>();
  for (const spec of specs) {
    if (!clubIdCache.has(spec.preferredClubIds.join(","))) {
      clubIdCache.set(
        spec.preferredClubIds.join(","),
        await resolveClubIds(spec.preferredClubIds),
      );
    }
    spec.preferredClubIds = clubIdCache.get(spec.preferredClubIds.join(","))!;
  }

  await prisma.$transaction(async (tx) => {
    for (const spec of specs) {
      const phoneE164 = phoneForIndex(spec.index);
      await tx.player.create({
        data: {
          ref: phoneE164,
          name: spec.profileName,
          phone: phoneE164,
        },
      });
    }

    for (const spec of specs) {
      await tx.user.create({
        data: {
          id: spec.id,
          manageToken: spec.manageToken,
          waId: spec.waId,
          phone: spec.phone,
          profileName: spec.profileName,
          optedIn: true,
          onboardingComplete: true,
          activeFlow: null,
          pendingFriendName: null,
          gender: spec.gender,
          level: spec.level,
          preferredSide: spec.preferredSide,
          playsBothSides: spec.playsBothSides,
          matchPreference: spec.matchPreference,
          matchLevelMin: spec.matchLevelMin,
          matchLevelMax: spec.matchLevelMax,
          createdAt: now,
          updatedAt: now,
          preferredClubs: {
            create: spec.preferredClubIds.map((clubId) => ({ clubId })),
          },
        },
      });
    }

    const favoritePairs = new Set<string>();
    for (const spec of specs) {
      for (const favIdx of spec.favoriteIndices) {
        const playerRef = phoneForIndex(favIdx);
        const key = `${spec.id}:${playerRef}`;
        if (favoritePairs.has(key)) continue;
        favoritePairs.add(key);
        await tx.userFavorite.create({
          data: { userId: spec.id, playerRef },
        });
      }
    }
  });

  const withLevelOnly = specs.filter((s) => s.matchPreference === "level_only").length;
  const totalFavorites = specs.reduce((n, s) => n + s.favoriteIndices.length, 0);

  console.log(`✓ Created ${SEED_COUNT} users (${SEED_WA_PREFIX}… waId)`);
  console.log(`✓ Phones +32490000001 … +32490000100`);
  console.log(`✓ All opted in, onboarding complete`);
  console.log(`✓ ${withLevelOnly} with level_only match preference`);
  console.log(`✓ ~${totalFavorites} maatjes links (each user has 8 favorites)`);
  console.log("\nSample manage URLs (set APP_ORIGIN in .env for full links):");
  for (const spec of specs.slice(0, 3)) {
    console.log(`  ${spec.profileName}: /maatjes/${spec.manageToken}`);
  }
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { waId: { startsWith: SEED_WA_PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) {
    console.log("No seed users to remove.");
    return;
  }

  const phones = Array.from({ length: SEED_COUNT }, (_, i) =>
    phoneForIndex(i),
  );

  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  for (const ref of phones) {
    const refs = await prisma.userFavorite.count({ where: { playerRef: ref } });
    if (refs === 0) {
      await prisma.player.deleteMany({ where: { ref } });
    }
  }

  console.log(`✓ Removed ${ids.length} seed users and orphan player rows`);
}

async function main(): Promise<void> {
  const cleanupMode = process.argv.includes("--cleanup");
  try {
    if (cleanupMode) {
      await cleanup();
    } else {
      await seed();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
