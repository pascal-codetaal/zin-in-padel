import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  Database,
  MatchPreference,
  Message,
  MessageDirection,
  PendingFriend,
  Player,
  PlayerRef,
  User,
} from "~/types/domain";
import { isPadelLevel, PADEL_LEVEL_MAX, PADEL_LEVEL_MIN } from "~/types/domain";

const DEFAULT_USER_FIELDS = {
  level: null,
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
  return JSON.parse(raw) as Database;
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
    await writeDb(db);
    return existing;
  }

  const user: User = {
    id: crypto.randomUUID(),
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
      | "level"
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

export async function updateUserProfile(
  userId: string,
  patch: {
    level?: number | null;
    preferredClubIds?: string[];
    matchPreference?: MatchPreference | null;
    onboardingComplete?: boolean;
  },
): Promise<User> {
  const db = await readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  if (patch.level !== undefined) {
    if (patch.level !== null && !isPadelLevel(patch.level)) {
      throw new Error(`Invalid padel level: ${patch.level}`);
    }
    user.level = patch.level;
  }

  if (patch.preferredClubIds !== undefined) {
    user.preferredClubIds = patch.preferredClubIds;
  }

  if (patch.matchPreference !== undefined) {
    user.matchPreference = patch.matchPreference;
    user.matchLevelMin = null;
    user.matchLevelMax = null;
    if (
      patch.matchPreference === "level_only" &&
      user.level !== null &&
      isPadelLevel(user.level)
    ) {
      user.matchLevelMin = Math.max(PADEL_LEVEL_MIN, user.level - 1);
      user.matchLevelMax = Math.min(PADEL_LEVEL_MAX, user.level + 1);
    }
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
