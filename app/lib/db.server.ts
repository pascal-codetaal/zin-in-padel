import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Database, InboundMessage, User } from "~/types/domain";

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
    Pick<User, "optedIn" | "onboardingComplete" | "onboardingStep" | "profileName">
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
): Promise<InboundMessage> {
  const db = await readDb();
  const message: InboundMessage = {
    id: crypto.randomUUID(),
    userId,
    body,
    receivedAt: new Date().toISOString(),
  };

  db.messages.push(message);
  await writeDb(db);
  return message;
}
