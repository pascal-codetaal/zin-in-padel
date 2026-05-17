import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  Database,
  Message,
  MessageDirection,
  Player,
  User,
} from "~/types/domain";

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
    onboardingStep: 0,
    activeFlow: null,
    favoritePlayerPhones: [],
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
      | "onboardingStep"
      | "profileName"
      | "activeFlow"
      | "favoritePlayerPhones"
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


export async function findPlayerByPhone(
  phone: string,
): Promise<Player | undefined> {
  const db = await readDb();
  return db.players.find((p) => p.phone === phone);
}

export async function upsertPlayer(input: Player): Promise<Player> {
  const db = await readDb();
  const existing = db.players.find((p) => p.phone === input.phone);

  if (existing) {
    existing.name = input.name;
    await writeDb(db);
    return existing;
  }

  const player: Player = { phone: input.phone, name: input.name };
  db.players.push(player);
  await writeDb(db);
  return player;
}

export async function addFavoriteToUser(
  userId: string,
  phone: string,
): Promise<User> {
  const db = await readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  if (!user.favoritePlayerPhones.includes(phone)) {
    user.favoritePlayerPhones.push(phone);
    user.updatedAt = new Date().toISOString();
    await writeDb(db);
  }
  return user;
}
