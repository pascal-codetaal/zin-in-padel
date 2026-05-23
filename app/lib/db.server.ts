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
import { createManageToken } from "~/lib/maatjes-url.server";
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
    acceptedPlayers: true;
    confirmedSlots: true;
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
  acceptedPlayers: true,
  confirmedSlots: true,
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

function userRowToDomain(row: UserRow): User {
  return {
    id: row.id,
    manageToken: row.manageToken,
    waId: row.waId,
    phone: row.phone,
    profileName: row.profileName,
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
    preferredClubIds: row.preferredClubs.map((c) => c.clubId),
    matchPreference: asMatchPreference(row.matchPreference),
    matchLevelMin: asLevel(row.matchLevelMin),
    matchLevelMax: asLevel(row.matchLevelMax),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function matchRowToDomain(row: MatchRow): Match {
  const confirmed = [...row.confirmedSlots]
    .sort((a, b) => a.idx - b.idx)
    .map((s) => s.name);
  return {
    id: row.id,
    organizerId: row.organizerId,
    clubId: row.clubId,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    durationMinutes: row.durationMinutes,
    format: asMatchFormat(row.format),
    totalSlots: row.totalSlots,
    confirmedSlotNames: confirmed,
    invitedFriendRefs: row.invitedPlayers.map((p) => p.playerRef),
    acceptedPlayerRefs: row.acceptedPlayers.map((p) => p.playerRef),
    fallbackToLevelRange: row.fallbackToLevelRange,
    fallbackLevelMin: asLevel(row.fallbackLevelMin),
    fallbackLevelMax: asLevel(row.fallbackLevelMax),
    fallbackLevelDelayMinutes: row.fallbackLevelDelayMinutes,
    fallbackToEveryone: row.fallbackToEveryone,
    fallbackEveryoneDelayMinutes: row.fallbackEveryoneDelayMinutes,
    status: asMatchStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

export async function upsertUser(
  input: Pick<User, "waId" | "phone" | "profileName">,
): Promise<User> {
  const now = new Date();
  const existing = await prisma.user.findUnique({ where: { waId: input.waId } });

  if (existing) {
    const updated = await prisma.user.update({
      where: { waId: input.waId },
      data: {
        phone: input.phone,
        profileName: input.profileName,
        updatedAt: now,
        manageToken: existing.manageToken || createManageToken(),
      },
      include: USER_INCLUDE,
    });
    return userRowToDomain(updated);
  }

  const created = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      manageToken: createManageToken(),
      waId: input.waId,
      phone: input.phone,
      profileName: input.profileName,
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
        // Skip if the Player row doesn't yet exist — callers should `upsertPlayer`
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

  const created = await prisma.user.create({
    data: {
      id,
      manageToken: createManageToken(),
      waId,
      phone: `whatsapp:+${waId}`,
      profileName: profileName.trim() || "Testgebruiker",
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

/* -------------------------------------------------------------------------- */
/*  Players & favorites                                                       */
/* -------------------------------------------------------------------------- */

export async function findPlayerByRef(
  ref: PlayerRef,
): Promise<Player | undefined> {
  const row = await prisma.player.findUnique({ where: { ref } });
  return row ? playerRowToDomain(row) : undefined;
}

export async function upsertPlayer(
  input: Pick<Player, "ref" | "name" | "phone">,
): Promise<Player> {
  const row = await prisma.player.upsert({
    where: { ref: input.ref },
    create: { ref: input.ref, name: input.name, phone: input.phone },
    update: { name: input.name, phone: input.phone },
  });
  return playerRowToDomain(row);
}

export async function addFavoriteToUser(
  userId: string,
  ref: PlayerRef,
): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error(`User not found: ${userId}`);

    const exists = await tx.userFavorite.findUnique({
      where: { userId_playerRef: { userId, playerRef: ref } },
    });
    if (!exists) {
      // Caller is expected to have upserted the Player first.
      await tx.userFavorite.create({ data: { userId, playerRef: ref } });
      await tx.user.update({
        where: { id: userId },
        data: { updatedAt: new Date() },
      });
    }

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

    if (patch.gender !== undefined) {
      user.gender = patch.gender;
      user.level = clampLevelToGender(user.level, user.gender);
      user.matchLevelMin = clampLevelToGender(user.matchLevelMin, user.gender);
      user.matchLevelMax = clampLevelToGender(user.matchLevelMax, user.gender);
    }

    if (patch.level !== undefined) {
      user.level = validateLevelInput(patch.level);
    }

    if (patch.preferredSide !== undefined) {
      user.preferredSide = patch.preferredSide;
      if (patch.preferredSide === null) {
        user.playsBothSides = false;
      }
    }
    if (patch.playsBothSides !== undefined) {
      user.playsBothSides = patch.playsBothSides;
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
    await tx.match.create({
      data: {
        id: matchId,
        organizerId,
        clubId: user.preferredClubIds[0] ?? null,
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
      },
    });

    if (user.profileName) {
      await tx.matchConfirmedSlot.create({
        data: { matchId, idx: 0, name: user.profileName },
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
    | "clubId"
    | "scheduledAt"
    | "durationMinutes"
    | "format"
    | "totalSlots"
    | "confirmedSlotNames"
    | "invitedFriendRefs"
    | "acceptedPlayerRefs"
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
    if (patch.clubId !== undefined) {
      data.club = patch.clubId
        ? { connect: { id: patch.clubId } }
        : { disconnect: true };
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
      await tx.matchInvitedPlayer.deleteMany({ where: { matchId } });
      for (const ref of patch.invitedFriendRefs) {
        const exists = await tx.player.findUnique({ where: { ref } });
        if (!exists) continue;
        await tx.matchInvitedPlayer.create({
          data: { matchId, playerRef: ref },
        });
      }
    }

    if (patch.acceptedPlayerRefs !== undefined) {
      await tx.matchAcceptedPlayer.deleteMany({ where: { matchId } });
      for (const ref of patch.acceptedPlayerRefs) {
        const exists = await tx.player.findUnique({ where: { ref } });
        if (!exists) continue;
        await tx.matchAcceptedPlayer.create({
          data: { matchId, playerRef: ref },
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
  const row = await prisma.match.update({
    where: { id: matchId },
    data: { status, updatedAt: new Date() },
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
