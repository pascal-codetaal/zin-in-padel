/**
 * Persistence layer over Prisma/Postgres. Replaces the JSON-file store.
 * Public API preserved — callers still operate on the domain types from
 * `~/types/domain`.
 */
import type {
  ActiveFlow,
  Database,
  Gender,
  Match,
  MatchFormat,
  MatchInvite,
  MatchInviteStatus,
  MatchPreference,
  MatchStatus,
  Message,
  MessageDirection,
  PadelLevel,
  PendingFriend,
  Player,
  PlayerRef,
  PreferredSide,
  User,
} from "~/types/domain";
import {
  clampLevelToGender,
  defaultMatchFormatFor,
  isPadelLevel,
  stepLevel,
} from "~/types/domain";
import {
  formatPersonName,
  parsePersonName,
  syncProfileNameFromParts,
} from "~/lib/person-name";
import { createManageToken } from "~/lib/vrienden-url.server";
import { createInviteToken } from "~/lib/cascade/token";
import { computeInitialCascadeState } from "~/lib/cascade/finalize";
import { prisma } from "~/lib/prisma.server";
import type { Prisma } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/*  Mappers (Prisma row → domain object)                                      */
/* -------------------------------------------------------------------------- */

type UserRow = Prisma.UserGetPayload<{
  include: { favorites: true; preferredClubs: true };
}>;

type MatchRow = Prisma.MatchGetPayload<{
  include: {
    invitedPlayers: true;
    confirmedSlots: true;
    clubs: true;
  };
}>;

type MessageRow = Prisma.MessageGetPayload<{}>;
type PlayerRow = Prisma.PlayerGetPayload<{}>;

const USER_INCLUDE = {
  favorites: true,
  preferredClubs: true,
} satisfies Prisma.UserInclude;

const MATCH_INCLUDE = {
  invitedPlayers: true,
  confirmedSlots: true,
  clubs: true,
} satisfies Prisma.MatchInclude;

function asGender(value: string | null): Gender | null {
  return value === "m" || value === "w" ? value : null;
}

function asPreferredSide(value: string | null): PreferredSide | null {
  return value === "left" || value === "right" ? value : null;
}

function asMatchPreference(value: string | null): MatchPreference | null {
  return value === "friends_only" || value === "level_only" || value === "open"
    ? value
    : null;
}

function asActiveFlow(value: string | null): ActiveFlow {
  return value === "onboarding" ||
    value === "favorites" ||
    value === "match_creation"
    ? value
    : null;
}

function asLevel(value: number | null): PadelLevel | null {
  return value !== null && isPadelLevel(value) ? value : null;
}

function asMatchFormat(value: string): MatchFormat {
  return value === "men_only" || value === "women_only" ? value : "mixed";
}

function asMatchStatus(value: string): MatchStatus {
  if (
    value === "draft" ||
    value === "open" ||
    value === "confirmed" ||
    value === "full" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "open";
}

function asMessageDirection(value: string): MessageDirection {
  return value === "out" ? "out" : "in";
}

export function userRowToDomain(row: UserRow): User {
  return {
    id: row.id,
    manageToken: row.manageToken,
    waId: row.waId,
    phone: row.phone,
    profileName: row.profileName,
    firstName: row.firstName,
    lastName: row.lastName,
    optedIn: row.optedIn,
    onboardingComplete: row.onboardingComplete,
    activeFlow: asActiveFlow(row.activeFlow),
    pendingFriend: row.pendingFriendName
      ? ({ name: row.pendingFriendName } satisfies PendingFriend)
      : null,
    gender: asGender(row.gender),
    level: asLevel(row.level),
    preferredSide: asPreferredSide(row.preferredSide),
    playsBothSides: row.playsBothSides,
    favoritePlayerRefs: row.favorites.map((f) => f.playerRef),
    favoriteNames: Object.fromEntries(
      row.favorites
        .filter((f) => f.name != null && f.name !== "")
        .map((f) => [f.playerRef, f.name as string]),
    ),
    preferredClubIds: row.preferredClubs.map((c) => c.clubId),
    matchPreference: asMatchPreference(row.matchPreference),
    matchLevelMin: asLevel(row.matchLevelMin),
    matchLevelMax: asLevel(row.matchLevelMax),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function matchRowToDomain(row: MatchRow): Match {
  const confirmed = [...row.confirmedSlots]
    .sort((a, b) => a.idx - b.idx)
    .map((s) => s.name);
  const clubIds =
    row.clubs.length > 0
      ? row.clubs.map((c) => c.clubId)
      : row.clubId
        ? [row.clubId]
        : [];
  return {
    id: row.id,
    organizerId: row.organizerId,
    clubId: clubIds[0] ?? row.clubId,
    clubIds,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    durationMinutes: row.durationMinutes,
    format: asMatchFormat(row.format),
    totalSlots: row.totalSlots,
    confirmedSlotNames: confirmed,
    invitedFriendRefs: row.invitedPlayers.map((p) => p.playerRef),
    invitedPlayers: row.invitedPlayers.map(invitedRowToDomain),
    fallbackToLevelRange: row.fallbackToLevelRange,
    fallbackLevelMin: asLevel(row.fallbackLevelMin),
    fallbackLevelMax: asLevel(row.fallbackLevelMax),
    fallbackLevelDelayMinutes: row.fallbackLevelDelayMinutes,
    fallbackToEveryone: row.fallbackToEveryone,
    fallbackEveryoneDelayMinutes: row.fallbackEveryoneDelayMinutes,
    currentCascadePhase: asCascadePhase(row.currentCascadePhase),
    nextCascadeAt: row.nextCascadeAt ? row.nextCascadeAt.toISOString() : null,
    status: asMatchStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function asCascadePhase(value: number): 0 | 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

function asInviteStatus(value: string): MatchInviteStatus {
  return value === "accepted" ||
    value === "declined" ||
    value === "expired"
    ? value
    : "pending";
}

function asInviteCascadePhase(value: number): 1 | 2 | 3 {
  return value === 2 || value === 3 ? value : 1;
}

function invitedRowToDomain(
  row: Prisma.MatchInvitedPlayerGetPayload<{}>,
): MatchInvite {
  return {
    playerRef: row.playerRef,
    token: row.token,
    status: asInviteStatus(row.status),
    cascadePhase: asInviteCascadePhase(row.cascadePhase),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
  };
}

function messageRowToDomain(row: MessageRow): Message {
  return {
    id: row.id,
    userId: row.userId,
    body: row.body,
    direction: asMessageDirection(row.direction),
    at: row.at.toISOString(),
  };
}

function playerRowToDomain(row: PlayerRow): Player {
  return { ref: row.ref, name: row.name, phone: row.phone };
}

/* -------------------------------------------------------------------------- */
/*  Users                                                                     */
/* -------------------------------------------------------------------------- */

export async function findUserByManageToken(
  manageToken: string,
): Promise<User | undefined> {
  const row = await prisma.user.findUnique({
    where: { manageToken },
    include: USER_INCLUDE,
  });
  return row ? userRowToDomain(row) : undefined;
}

export async function findUserByWaId(waId: string): Promise<User | undefined> {
  const row = await prisma.user.findUnique({
    where: { waId },
    include: USER_INCLUDE,
  });
  return row ? userRowToDomain(row) : undefined;
}

export async function findUserById(userId: string): Promise<User | undefined> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    include: USER_INCLUDE,
  });
  return row ? userRowToDomain(row) : undefined;
}

export async function findUserByPhone(
  phone: string,
): Promise<User | undefined> {
  // Players store bare phones (+32...), Users store the WhatsApp-prefixed
  // form (whatsapp:+32...). Try both so cascade dispatch can resolve an
  // invitee Player to its User row regardless of how the caller passes it.
  const bare = phone.replace(/^whatsapp:/, "");
  const prefixed = bare.startsWith("whatsapp:") ? bare : `whatsapp:${bare}`;
  const row = await prisma.user.findFirst({
    where: { phone: { in: [phone, bare, prefixed] } },
    include: USER_INCLUDE,
  });
  return row ? userRowToDomain(row) : undefined;
}

export async function upsertUser(
  input: Pick<User, "waId" | "phone" | "profileName">,
): Promise<User> {
  const now = new Date();
  const existing = await prisma.user.findUnique({ where: { waId: input.waId } });

  if (existing) {
    const parsed = parsePersonName(input.profileName);
    const nameData: { firstName?: string | null; lastName?: string | null } =
      {};
    if (parsed.lastName) {
      nameData.firstName = parsed.firstName;
      nameData.lastName = parsed.lastName;
    } else if (parsed.firstName && !existing.firstName) {
      nameData.firstName = parsed.firstName;
    }

    const updated = await prisma.user.update({
      where: { waId: input.waId },
      data: {
        phone: input.phone,
        profileName: input.profileName,
        ...nameData,
        updatedAt: now,
        manageToken: existing.manageToken || createManageToken(),
      },
      include: USER_INCLUDE,
    });
    return userRowToDomain(updated);
  }

  const parsed = parsePersonName(input.profileName);
  const created = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      manageToken: createManageToken(),
      waId: input.waId,
      phone: input.phone,
      profileName: input.profileName,
      firstName: parsed.firstName || null,
      lastName: parsed.lastName,
      optedIn: false,
      onboardingComplete: false,
      activeFlow: null,
      pendingFriendName: null,
      gender: null,
      level: null,
      preferredSide: null,
      playsBothSides: false,
      matchPreference: null,
      matchLevelMin: null,
      matchLevelMax: null,
      createdAt: now,
      updatedAt: now,
    },
    include: USER_INCLUDE,
  });
  return userRowToDomain(created);
}

export async function updateUser(
  userId: string,
  patch: Partial<
    Pick<
      User,
      | "optedIn"
      | "onboardingComplete"
      | "profileName"
      | "firstName"
      | "lastName"
      | "activeFlow"
      | "favoritePlayerRefs"
      | "gender"
      | "level"
      | "preferredSide"
      | "playsBothSides"
      | "preferredClubIds"
      | "matchPreference"
      | "matchLevelMin"
      | "matchLevelMax"
      | "pendingFriend"
    >
  >,
): Promise<User> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id: userId } });
    if (!existing) throw new Error(`User not found: ${userId}`);

    const data: Prisma.UserUpdateInput = { updatedAt: now };
    if (patch.optedIn !== undefined) data.optedIn = patch.optedIn;
    if (patch.onboardingComplete !== undefined)
      data.onboardingComplete = patch.onboardingComplete;
    if (patch.profileName !== undefined) data.profileName = patch.profileName;
    if (patch.firstName !== undefined) data.firstName = patch.firstName;
    if (patch.lastName !== undefined) data.lastName = patch.lastName;
    if (patch.activeFlow !== undefined) data.activeFlow = patch.activeFlow;
    if (patch.gender !== undefined) data.gender = patch.gender;
    if (patch.level !== undefined) data.level = patch.level;
    if (patch.preferredSide !== undefined)
      data.preferredSide = patch.preferredSide;
    if (patch.playsBothSides !== undefined)
      data.playsBothSides = patch.playsBothSides;
    if (patch.matchPreference !== undefined)
      data.matchPreference = patch.matchPreference;
    if (patch.matchLevelMin !== undefined)
      data.matchLevelMin = patch.matchLevelMin;
    if (patch.matchLevelMax !== undefined)
      data.matchLevelMax = patch.matchLevelMax;
    if (patch.pendingFriend !== undefined)
      data.pendingFriendName = patch.pendingFriend?.name ?? null;

    await tx.user.update({ where: { id: userId }, data });

    if (patch.favoritePlayerRefs !== undefined) {
      await tx.userFavorite.deleteMany({ where: { userId } });
      for (const ref of patch.favoritePlayerRefs) {
        // Skip if the Player row doesn't yet exist — callers should `ensurePlayer`
        // first. Defensive guard avoids FK errors on stale callers.
        const exists = await tx.player.findUnique({ where: { ref } });
        if (!exists) continue;
        await tx.userFavorite.create({ data: { userId, playerRef: ref } });
      }
    }

    if (patch.preferredClubIds !== undefined) {
      await tx.userPreferredClub.deleteMany({ where: { userId } });
      for (const clubId of patch.preferredClubIds) {
        await tx.userPreferredClub.create({ data: { userId, clubId } });
      }
    }

    const row = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    return userRowToDomain(row);
  });
}

export async function setPendingFriend(
  userId: string,
  pending: PendingFriend,
): Promise<User> {
  return updateUser(userId, { pendingFriend: pending });
}

export async function clearPendingFriend(userId: string): Promise<User> {
  return updateUser(userId, { pendingFriend: null });
}

export async function createDevTestUser(profileName: string): Promise<User> {
  const now = new Date();
  const id = crypto.randomUUID();
  const waId = `dev-${id.slice(0, 8)}`;

  const parsed = parsePersonName(profileName.trim() || "Testgebruiker");
  const created = await prisma.user.create({
    data: {
      id,
      manageToken: createManageToken(),
      waId,
      phone: `whatsapp:+${waId}`,
      profileName: syncProfileNameFromParts(parsed) || "Testgebruiker",
      firstName: parsed.firstName || null,
      lastName: parsed.lastName,
      optedIn: false,
      onboardingComplete: false,
      activeFlow: null,
      pendingFriendName: null,
      gender: null,
      level: null,
      preferredSide: null,
      playsBothSides: false,
      matchPreference: null,
      matchLevelMin: null,
      matchLevelMax: null,
      createdAt: now,
      updatedAt: now,
    },
    include: USER_INCLUDE,
  });
  return userRowToDomain(created);
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                  */
/* -------------------------------------------------------------------------- */

export async function getMessagesForUser(userId: string): Promise<Message[]> {
  const rows = await prisma.message.findMany({
    where: { userId },
    orderBy: { at: "asc" },
  });
  return rows.map(messageRowToDomain);
}

export async function appendMessage(
  userId: string,
  body: string,
  direction: MessageDirection,
): Promise<Message> {
  const row = await prisma.message.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      body,
      direction,
      at: new Date(),
    },
  });
  return messageRowToDomain(row);
}

export async function deleteMessagesForUser(userId: string): Promise<number> {
  const result = await prisma.message.deleteMany({ where: { userId } });
  return result.count;
}

/* -------------------------------------------------------------------------- */
/*  Players & favorites                                                       */
/* -------------------------------------------------------------------------- */

export async function findPlayerByRef(
  ref: PlayerRef,
): Promise<Player | undefined> {
  const row = await prisma.player.findUnique({ where: { ref } });
  return row ? playerRowToDomain(row) : undefined;
}

/**
 * Ensure a Player row exists for `ref` (required for FK targets). Never
 * overwrites an existing Player's name — the canonical name stays stable and
 * per-user labels live on `UserFavorite.name`. The provided name only seeds a
 * brand-new row.
 */
export async function ensurePlayer(
  input: Pick<Player, "ref" | "name" | "phone">,
): Promise<Player> {
  const row = await prisma.player.upsert({
    where: { ref: input.ref },
    create: { ref: input.ref, name: input.name, phone: input.phone },
    update: {},
  });
  return playerRowToDomain(row);
}

export async function addFavoriteToUser(
  userId: string,
  ref: PlayerRef,
  name?: string,
): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error(`User not found: ${userId}`);

    // Caller is expected to have ensured the Player row first.
    await tx.userFavorite.upsert({
      where: { userId_playerRef: { userId, playerRef: ref } },
      create: { userId, playerRef: ref, name: name ?? null },
      update: name === undefined ? {} : { name },
    });
    await tx.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });

    const row = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    return userRowToDomain(row);
  });
}

export async function removeFavoriteFromUser(
  userId: string,
  ref: PlayerRef,
): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error(`User not found: ${userId}`);

    await tx.userFavorite.deleteMany({
      where: { userId, playerRef: ref },
    });
    await tx.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });

    const row = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    return userRowToDomain(row);
  });
}

/**
 * Set (or clear, with `null`) the viewer's private nickname for an existing
 * favorite. No-op when the favorite does not exist — the Player/User name is
 * never touched, only this user's label.
 */
export async function setFavoriteNickname(
  userId: string,
  ref: PlayerRef,
  name: string | null,
): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error(`User not found: ${userId}`);

    await tx.userFavorite.updateMany({
      where: { userId, playerRef: ref },
      data: { name },
    });
    await tx.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });

    const row = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    return userRowToDomain(row);
  });
}

/* -------------------------------------------------------------------------- */
/*  Profile                                                                   */
/* -------------------------------------------------------------------------- */

function validateLevelInput(value: number | null): PadelLevel | null {
  if (value === null) return null;
  if (!isPadelLevel(value)) {
    throw new Error(`Invalid padel level: ${value}`);
  }
  return value;
}

export async function updateUserProfile(
  userId: string,
  patch: {
    firstName?: string | null;
    lastName?: string | null;
    gender?: Gender | null;
    level?: number | null;
    preferredSide?: PreferredSide | null;
    playsBothSides?: boolean;
    preferredClubIds?: string[];
    matchPreference?: MatchPreference | null;
    matchLevelMin?: number | null;
    matchLevelMax?: number | null;
    onboardingComplete?: boolean;
  },
): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    if (!existing) throw new Error(`User not found: ${userId}`);
    let user = userRowToDomain(existing);

    if (patch.firstName !== undefined) user.firstName = patch.firstName?.trim() || null;
    if (patch.lastName !== undefined) user.lastName = patch.lastName?.trim() || null;
    if (patch.firstName !== undefined || patch.lastName !== undefined) {
      user.profileName = syncProfileNameFromParts(user) || user.profileName;
    }

    if (patch.gender !== undefined) {
      user.gender = patch.gender;
      user.level = clampLevelToGender(user.level, user.gender);
      user.matchLevelMin = clampLevelToGender(user.matchLevelMin, user.gender);
      user.matchLevelMax = clampLevelToGender(user.matchLevelMax, user.gender);
    }

    if (patch.level !== undefined) {
      user.level = validateLevelInput(patch.level);
    }

    if (patch.playsBothSides !== undefined) {
      user.playsBothSides = patch.playsBothSides;
    }
    if (patch.preferredSide !== undefined) {
      user.preferredSide = patch.preferredSide;
      if (patch.preferredSide === null && !user.playsBothSides) {
        user.playsBothSides = false;
      }
    }

    if (patch.preferredClubIds !== undefined) {
      user.preferredClubIds = patch.preferredClubIds;
    }

    if (patch.matchPreference !== undefined) {
      user.matchPreference = patch.matchPreference;
      user.matchLevelMin = null;
      user.matchLevelMax = null;
      if (patch.matchPreference === "level_only" && user.level !== null) {
        user.matchLevelMin = stepLevel(user.level, "down", user.gender);
        user.matchLevelMax = stepLevel(user.level, "up", user.gender);
      }
    }

    if (patch.matchLevelMin !== undefined) {
      user.matchLevelMin =
        patch.matchLevelMin === null
          ? null
          : clampLevelToGender(patch.matchLevelMin, user.gender);
    }
    if (patch.matchLevelMax !== undefined) {
      user.matchLevelMax =
        patch.matchLevelMax === null
          ? null
          : clampLevelToGender(patch.matchLevelMax, user.gender);
    }
    if (
      user.matchLevelMin !== null &&
      user.matchLevelMax !== null &&
      user.matchLevelMin > user.matchLevelMax
    ) {
      [user.matchLevelMin, user.matchLevelMax] = [
        user.matchLevelMax,
        user.matchLevelMin,
      ];
    }

    if (patch.onboardingComplete !== undefined) {
      user.onboardingComplete = patch.onboardingComplete;
      if (patch.onboardingComplete) {
        user.activeFlow = null;
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        profileName: user.profileName,
        firstName: user.firstName,
        lastName: user.lastName,
        gender: user.gender,
        level: user.level,
        preferredSide: user.preferredSide,
        playsBothSides: user.playsBothSides,
        matchPreference: user.matchPreference,
        matchLevelMin: user.matchLevelMin,
        matchLevelMax: user.matchLevelMax,
        onboardingComplete: user.onboardingComplete,
        activeFlow: user.activeFlow,
        updatedAt: new Date(),
      },
    });

    if (patch.preferredClubIds !== undefined) {
      await tx.userPreferredClub.deleteMany({ where: { userId } });
      for (const clubId of patch.preferredClubIds) {
        await tx.userPreferredClub.create({ data: { userId, clubId } });
      }
    }

    const row = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    return userRowToDomain(row);
  });
}

/* -------------------------------------------------------------------------- */
/*  Matches                                                                   */
/* -------------------------------------------------------------------------- */

export async function findOrCreateDraftMatch(
  organizerId: string,
): Promise<Match> {
  return prisma.$transaction(async (tx) => {
    const userRow = await tx.user.findUnique({
      where: { id: organizerId },
      include: USER_INCLUDE,
    });
    if (!userRow) throw new Error(`User not found: ${organizerId}`);
    const user = userRowToDomain(userRow);

    const existing = await tx.match.findFirst({
      where: { organizerId, status: "draft" },
      include: MATCH_INCLUDE,
    });
    if (existing) return matchRowToDomain(existing);

    const now = new Date();
    const matchId = crypto.randomUUID();
    const initialClubIds = user.preferredClubIds;
    await tx.match.create({
      data: {
        id: matchId,
        organizerId,
        clubId: initialClubIds[0] ?? null,
        scheduledAt: null,
        durationMinutes: 90,
        format: defaultMatchFormatFor(user.gender),
        totalSlots: 4,
        fallbackToLevelRange: false,
        fallbackLevelMin: user.matchLevelMin ?? null,
        fallbackLevelMax: user.matchLevelMax ?? null,
        fallbackLevelDelayMinutes: 30,
        fallbackToEveryone: false,
        fallbackEveryoneDelayMinutes: 60,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        clubs:
          initialClubIds.length > 0
            ? {
                create: initialClubIds.map((clubId) => ({ clubId })),
              }
            : undefined,
      },
    });

    if (user.firstName || user.lastName || user.profileName) {
      const organiserName = formatPersonName({
        firstName: user.firstName,
        lastName: user.lastName,
        profileName: user.profileName,
        fallback: "Organisator",
      });
      await tx.matchConfirmedSlot.create({
        data: { matchId, idx: 0, name: organiserName },
      });
    }

    const row = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    return matchRowToDomain(row);
  });
}

export async function findDraftMatch(
  organizerId: string,
): Promise<Match | undefined> {
  const row = await prisma.match.findFirst({
    where: { organizerId, status: "draft" },
    include: MATCH_INCLUDE,
  });
  return row ? matchRowToDomain(row) : undefined;
}

export async function findMatchById(
  matchId: string,
): Promise<Match | undefined> {
  const row = await prisma.match.findUnique({
    where: { id: matchId },
    include: MATCH_INCLUDE,
  });
  return row ? matchRowToDomain(row) : undefined;
}

export async function findMatchesByOrganizer(
  organizerId: string,
): Promise<Match[]> {
  const rows = await prisma.match.findMany({
    where: { organizerId, status: { not: "draft" } },
    include: MATCH_INCLUDE,
  });
  const matches = rows.map(matchRowToDomain);
  return matches.sort((a, b) => {
    const ta = a.scheduledAt ?? a.createdAt;
    const tb = b.scheduledAt ?? b.createdAt;
    return tb.localeCompare(ta);
  });
}

export async function cancelMatch(matchId: string): Promise<Match> {
  const row = await prisma.match.update({
    where: { id: matchId },
    data: { status: "cancelled", updatedAt: new Date() },
    include: MATCH_INCLUDE,
  });
  return matchRowToDomain(row);
}

export type MatchDraftPatch = Partial<
  Pick<
    Match,
    | "clubIds"
    | "scheduledAt"
    | "durationMinutes"
    | "format"
    | "totalSlots"
    | "confirmedSlotNames"
    | "invitedFriendRefs"
    | "fallbackToLevelRange"
    | "fallbackLevelMin"
    | "fallbackLevelMax"
    | "fallbackLevelDelayMinutes"
    | "fallbackToEveryone"
    | "fallbackEveryoneDelayMinutes"
  >
>;

export async function updateMatchDraft(
  matchId: string,
  patch: MatchDraftPatch,
): Promise<Match> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.match.findUnique({ where: { id: matchId } });
    if (!existing) throw new Error(`Match not found: ${matchId}`);
    if (existing.status !== "draft") {
      throw new Error(`Cannot edit a non-draft match (${existing.status})`);
    }

    const data: Prisma.MatchUpdateInput = { updatedAt: new Date() };
    if (patch.clubIds !== undefined) {
      const clubIds = [...new Set(patch.clubIds)];
      data.club = clubIds[0]
        ? { connect: { id: clubIds[0] } }
        : { disconnect: true };
      await tx.matchClub.deleteMany({ where: { matchId } });
      if (clubIds.length > 0) {
        await tx.matchClub.createMany({
          data: clubIds.map((clubId) => ({ matchId, clubId })),
          skipDuplicates: true,
        });
      }
    }
    if (patch.scheduledAt !== undefined) {
      data.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
    }
    if (patch.durationMinutes !== undefined)
      data.durationMinutes = patch.durationMinutes;
    if (patch.format !== undefined) data.format = patch.format;
    if (patch.totalSlots !== undefined) data.totalSlots = patch.totalSlots;
    if (patch.fallbackToLevelRange !== undefined)
      data.fallbackToLevelRange = patch.fallbackToLevelRange;
    if (patch.fallbackLevelMin !== undefined)
      data.fallbackLevelMin = patch.fallbackLevelMin;
    if (patch.fallbackLevelMax !== undefined)
      data.fallbackLevelMax = patch.fallbackLevelMax;
    if (patch.fallbackLevelDelayMinutes !== undefined)
      data.fallbackLevelDelayMinutes = patch.fallbackLevelDelayMinutes;
    if (patch.fallbackToEveryone !== undefined)
      data.fallbackToEveryone = patch.fallbackToEveryone;
    if (patch.fallbackEveryoneDelayMinutes !== undefined)
      data.fallbackEveryoneDelayMinutes = patch.fallbackEveryoneDelayMinutes;

    await tx.match.update({ where: { id: matchId }, data });

    if (patch.confirmedSlotNames !== undefined) {
      await tx.matchConfirmedSlot.deleteMany({ where: { matchId } });
      for (let i = 0; i < patch.confirmedSlotNames.length; i++) {
        await tx.matchConfirmedSlot.create({
          data: { matchId, idx: i, name: patch.confirmedSlotNames[i]! },
        });
      }
    }

    if (patch.invitedFriendRefs !== undefined) {
      // Draft-stage: rewrite the invited set. The cascade engine assigns
      // real tokens/sentAt/cascadePhase when phase 1 actually fires; draft
      // rows are placeholders so the picker UI can list selections.
      await tx.matchInvitedPlayer.deleteMany({ where: { matchId } });
      for (const ref of patch.invitedFriendRefs) {
        const exists = await tx.player.findUnique({ where: { ref } });
        if (!exists) continue;
        await tx.matchInvitedPlayer.create({
          data: {
            matchId,
            playerRef: ref,
            token: createInviteToken(),
            status: "pending",
            cascadePhase: 1,
          },
        });
      }
    }

    const row = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    return matchRowToDomain(row);
  });
}

export async function finalizeMatchDraft(
  matchId: string,
  status: MatchStatus = "open",
): Promise<Match> {
  const now = new Date();

  // Load the draft so the cascade helper can decide the initial schedule
  // (phase 1 is implicit at finalize; nextCascadeAt depends on which
  // fallbacks are enabled).
  const draftRow = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: MATCH_INCLUDE,
  });
  const cascade = computeInitialCascadeState(matchRowToDomain(draftRow), now);

  const row = await prisma.match.update({
    where: { id: matchId },
    data: {
      status,
      currentCascadePhase: cascade.currentCascadePhase,
      nextCascadeAt: cascade.nextCascadeAt,
      updatedAt: now,
    },
    include: MATCH_INCLUDE,
  });
  return matchRowToDomain(row);
}

export async function discardMatchDraft(matchId: string): Promise<void> {
  await prisma.match.deleteMany({ where: { id: matchId } });
}

/* -------------------------------------------------------------------------- */
/*  Full snapshot (used by a couple of routes)                                */
/* -------------------------------------------------------------------------- */

export async function getDatabase(): Promise<Database> {
  const [userRows, playerRows, gameRows, messageRows, matchRows] =
    await Promise.all([
      prisma.user.findMany({ include: USER_INCLUDE }),
      prisma.player.findMany(),
      prisma.game.findMany(),
      prisma.message.findMany(),
      prisma.match.findMany({ include: MATCH_INCLUDE }),
    ]);

  return {
    users: userRows.map(userRowToDomain),
    players: playerRows.map(playerRowToDomain),
    games: gameRows.map((g) => ({
      id: g.id,
      title: g.title,
      scheduledAt: g.scheduledAt.toISOString(),
      status: g.status === "full" || g.status === "cancelled" ? g.status : "open",
    })),
    matches: matchRows.map(matchRowToDomain),
    messages: messageRows.map(messageRowToDomain),
  };
}

export type { Match, MatchFormat, MatchStatus };
