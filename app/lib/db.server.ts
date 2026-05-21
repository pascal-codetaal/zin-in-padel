import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
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

const DEFAULT_USER_FIELDS = {
  gender: null,
  level: null,
  preferredSide: null,
  playsBothSides: false,
  favoritePlayerRefs: [] as string[],
  preferredClubIds: [] as string[],
  matchPreference: null,
  matchLevelMin: null,
  matchLevelMax: null,
  pendingFriend: null,
} satisfies Partial<User>;

const DB_PATH = path.join(process.cwd(), "data", "db.json");

async function readDb(): Promise<Database> {
  const raw = await readFile(DB_PATH, "utf-8");
  const db = JSON.parse(raw) as Database;
  let changed = false;
  if (!db.matches) {
    db.matches = [];
    changed = true;
  }
  for (const match of db.matches) {
    if (typeof match.totalSlots !== "number") {
      match.totalSlots = 4;
      changed = true;
    }
    if (!Array.isArray(match.confirmedSlotNames)) {
      match.confirmedSlotNames = [];
      changed = true;
    }
    if (!Array.isArray(match.acceptedPlayerRefs)) {
      match.acceptedPlayerRefs = [];
      changed = true;
    }
    if (typeof match.fallbackLevelDelayMinutes !== "number") {
      match.fallbackLevelDelayMinutes = 30;
      changed = true;
    }
    if (typeof match.fallbackEveryoneDelayMinutes !== "number") {
      match.fallbackEveryoneDelayMinutes = 60;
      changed = true;
    }
  }
  for (const user of db.users) {
    if (!user.manageToken) {
      user.manageToken = createManageToken();
      changed = true;
    }
    if (user.preferredSide === undefined) {
      user.preferredSide = null;
      changed = true;
    }
    if (user.playsBothSides === undefined) {
      user.playsBothSides = false;
      changed = true;
    }
  }
  if (changed) {
    await writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf-8");
  }
  return db;
}

export async function findUserByManageToken(
  manageToken: string,
): Promise<User | undefined> {
  const db = await readDb();
  return db.users.find((user) => user.manageToken === manageToken);
}

async function writeDb(db: Database): Promise<void> {
  await writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf-8");
}

export async function getDatabase(): Promise<Database> {
  return readDb();
}

export async function findUserByWaId(waId: string): Promise<User | undefined> {
  const db = await readDb();
  return db.users.find((user) => user.waId === waId);
}

export async function findUserById(userId: string): Promise<User | undefined> {
  const db = await readDb();
  return db.users.find((user) => user.id === userId);
}

export async function upsertUser(
  input: Pick<User, "waId" | "phone" | "profileName">,
): Promise<User> {
  const db = await readDb();
  const now = new Date().toISOString();
  const existing = db.users.find((user) => user.waId === input.waId);

  if (existing) {
    existing.phone = input.phone;
    existing.profileName = input.profileName;
    existing.updatedAt = now;
    if (!existing.manageToken) {
      existing.manageToken = createManageToken();
    }
    await writeDb(db);
    return existing;
  }

  const user: User = {
    id: crypto.randomUUID(),
    manageToken: createManageToken(),
    waId: input.waId,
    phone: input.phone,
    profileName: input.profileName,
    optedIn: false,
    onboardingComplete: false,
    activeFlow: null,
    ...DEFAULT_USER_FIELDS,
    createdAt: now,
    updatedAt: now,
  };

  db.users.push(user);
  await writeDb(db);
  return user;
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
  const db = await readDb();
  const user = db.users.find((entry) => entry.id === userId);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  Object.assign(user, patch, { updatedAt: new Date().toISOString() });
  await writeDb(db);
  return user;
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

export async function getMessagesForUser(userId: string): Promise<Message[]> {
  const db = await readDb();
  return db.messages
    .filter((m) => m.userId === userId)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export async function createDevTestUser(profileName: string): Promise<User> {
  const db = await readDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const waId = `dev-${id.slice(0, 8)}`;

  const user: User = {
    id,
    manageToken: createManageToken(),
    waId,
    phone: `whatsapp:+${waId}`,
    profileName: profileName.trim() || "Testgebruiker",
    optedIn: false,
    onboardingComplete: false,
    activeFlow: null,
    ...DEFAULT_USER_FIELDS,
    createdAt: now,
    updatedAt: now,
  };

  db.users.push(user);
  await writeDb(db);
  return user;
}

export async function appendMessage(
  userId: string,
  body: string,
  direction: MessageDirection,
): Promise<Message> {
  const db = await readDb();
  const message: Message = {
    id: crypto.randomUUID(),
    userId,
    body,
    direction,
    at: new Date().toISOString(),
  };

  db.messages.push(message);
  await writeDb(db);
  return message;
}

export async function findPlayerByRef(
  ref: PlayerRef,
): Promise<Player | undefined> {
  const db = await readDb();
  return db.players.find((p) => p.ref === ref);
}

export async function upsertPlayer(
  input: Pick<Player, "ref" | "name" | "phone">,
): Promise<Player> {
  const db = await readDb();
  const existing = db.players.find((p) => p.ref === input.ref);

  if (existing) {
    existing.name = input.name;
    existing.phone = input.phone;
    await writeDb(db);
    return existing;
  }

  const player: Player = {
    ref: input.ref,
    name: input.name,
    phone: input.phone,
  };
  db.players.push(player);
  await writeDb(db);
  return player;
}

export async function addFavoriteToUser(
  userId: string,
  ref: PlayerRef,
): Promise<User> {
  const db = await readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  if (!user.favoritePlayerRefs.includes(ref)) {
    user.favoritePlayerRefs.push(ref);
    user.updatedAt = new Date().toISOString();
    await writeDb(db);
  }
  return user;
}

export async function removeFavoriteFromUser(
  userId: string,
  ref: PlayerRef,
): Promise<User> {
  const db = await readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  user.favoritePlayerRefs = user.favoritePlayerRefs.filter((r) => r !== ref);
  user.updatedAt = new Date().toISOString();
  await writeDb(db);
  return user;
}

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
  const db = await readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error(`User not found: ${userId}`);

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

  user.updatedAt = new Date().toISOString();
  await writeDb(db);
  return user;
}

/* -------------------------------------------------------------------------- */
/*  Matches                                                                   */
/* -------------------------------------------------------------------------- */

function makeDraftMatch(organizer: User): Match {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    organizerId: organizer.id,
    clubId: organizer.preferredClubIds[0] ?? null,
    scheduledAt: null,
    durationMinutes: 90,
    format: defaultMatchFormatFor(organizer.gender),
    totalSlots: 4,
    confirmedSlotNames: organizer.profileName ? [organizer.profileName] : [],
    invitedFriendRefs: [...organizer.favoritePlayerRefs],
    acceptedPlayerRefs: [],
    fallbackToLevelRange: false,
    fallbackLevelMin: organizer.matchLevelMin ?? null,
    fallbackLevelMax: organizer.matchLevelMax ?? null,
    fallbackLevelDelayMinutes: 30,
    fallbackToEveryone: false,
    fallbackEveryoneDelayMinutes: 60,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Find an existing draft match for the user, or create a new one with defaults.
 * One draft per user keeps the wizard simple.
 */
export async function findOrCreateDraftMatch(
  organizerId: string,
): Promise<Match> {
  const db = await readDb();
  const user = db.users.find((u) => u.id === organizerId);
  if (!user) throw new Error(`User not found: ${organizerId}`);

  const existing = (db.matches ?? []).find(
    (m) => m.organizerId === organizerId && m.status === "draft",
  );
  if (existing) return existing;

  const draft = makeDraftMatch(user);
  db.matches = [...(db.matches ?? []), draft];
  await writeDb(db);
  return draft;
}

export async function findDraftMatch(
  organizerId: string,
): Promise<Match | undefined> {
  const db = await readDb();
  return (db.matches ?? []).find(
    (m) => m.organizerId === organizerId && m.status === "draft",
  );
}

export async function findMatchById(
  matchId: string,
): Promise<Match | undefined> {
  const db = await readDb();
  return (db.matches ?? []).find((m) => m.id === matchId);
}

/**
 * All non-draft matches organized by a user, newest first.
 * Drafts are excluded because they're work-in-progress and live behind the
 * wizard.
 */
export async function findMatchesByOrganizer(
  organizerId: string,
): Promise<Match[]> {
  const db = await readDb();
  return (db.matches ?? [])
    .filter((m) => m.organizerId === organizerId && m.status !== "draft")
    .sort((a, b) => {
      const ta = a.scheduledAt ?? a.createdAt;
      const tb = b.scheduledAt ?? b.createdAt;
      return tb.localeCompare(ta);
    });
}

export async function cancelMatch(matchId: string): Promise<Match> {
  const db = await readDb();
  const match = (db.matches ?? []).find((m) => m.id === matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  match.status = "cancelled";
  match.updatedAt = new Date().toISOString();
  await writeDb(db);
  return match;
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
  const db = await readDb();
  const match = (db.matches ?? []).find((m) => m.id === matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  if (match.status !== "draft") {
    throw new Error(`Cannot edit a non-draft match (${match.status})`);
  }
  Object.assign(match, patch, { updatedAt: new Date().toISOString() });
  await writeDb(db);
  return match;
}

export async function finalizeMatchDraft(
  matchId: string,
  status: MatchStatus = "open",
): Promise<Match> {
  const db = await readDb();
  const match = (db.matches ?? []).find((m) => m.id === matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  match.status = status;
  match.updatedAt = new Date().toISOString();
  await writeDb(db);
  return match;
}

export async function discardMatchDraft(matchId: string): Promise<void> {
  const db = await readDb();
  db.matches = (db.matches ?? []).filter((m) => m.id !== matchId);
  await writeDb(db);
}

/** Format helper used by the dashboard. */
export type { Match, MatchFormat, MatchStatus };
