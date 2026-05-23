/**
 * One-time copy of Mastra Memory rows from the local LibSQL/SQLite file
 * (`data/mastra-memory.db`) into the Postgres store now used by Mastra.
 *
 * Run with:  pnpm tsx scripts/migrate-mastra-memory-to-pg.ts
 */
import "dotenv/config";
import dns from "node:dns";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { Pool } from "pg";
import { PostgresStore } from "@mastra/pg";

// Avoid macOS DNS resolver flake under burst — pre-resolve once, IPv4 first.
dns.setDefaultResultOrder("ipv4first");

const sqlitePath = path.resolve("data/mastra-memory.db");
const connectionString =
  process.env.MASTRA_MEMORY_DB_URL ??
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL (or DIRECT_URL / MASTRA_MEMORY_DB_URL) not set.");
  process.exit(1);
}
if (!fs.existsSync(sqlitePath)) {
  console.error(`No local memory DB at ${sqlitePath} — nothing to migrate.`);
  process.exit(0);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const pool = new Pool({ connectionString, max: 4 });
const pg = new PostgresStore({ id: "padel-memory", pool });
await pg.init();
const memoryStore = await pg.getStore("memory");
if (!memoryStore) {
  throw new Error("Postgres memory store unavailable after init().");
}

type SqliteThread = {
  id: string;
  resourceId: string;
  title: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
};
type SqliteMessage = {
  id: string;
  thread_id: string;
  content: string;
  role: string;
  type: string;
  createdAt: string;
  resourceId: string | null;
};

const threads = sqlite
  .prepare<[], SqliteThread>("SELECT * FROM mastra_threads")
  .all();
const messages = sqlite
  .prepare<[], SqliteMessage>(
    "SELECT * FROM mastra_messages ORDER BY thread_id, createdAt",
  )
  .all();

console.log(`Found ${threads.length} threads / ${messages.length} messages in SQLite.`);

let threadsCopied = 0;
for (const t of threads) {
  const existing = await memoryStore.getThreadById({ threadId: t.id });
  if (existing) continue;
  await memoryStore.saveThread({
    thread: {
      id: t.id,
      resourceId: t.resourceId,
      title: t.title ?? "",
      metadata: parseMetadata(t.metadata),
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(t.updatedAt),
    },
  });
  threadsCopied++;
}

let messagesCopied = 0;
if (messages.length > 0) {
  const mapped = messages.map((m: SqliteMessage) => ({
    id: m.id,
    threadId: m.thread_id,
    role: m.role as "user" | "assistant" | "system" | "tool",
    type: m.type,
    content: safeJSON(m.content),
    resourceId: m.resourceId ?? undefined,
    createdAt: new Date(m.createdAt),
  }));
  // saveMessages is idempotent on id collisions in most adapters; if not,
  // we filter against existing IDs per thread.
  const byThread = new Map<string, typeof mapped>();
  for (const m of mapped) {
    const arr = byThread.get(m.threadId) ?? [];
    arr.push(m);
    byThread.set(m.threadId, arr);
  }
  for (const [threadId, batch] of byThread) {
    const existing = await memoryStore.listMessages({ threadId });
    const existingIds = new Set(
      (existing?.messages ?? []).map((m: { id: string }) => m.id),
    );
    const fresh = batch.filter((m) => !existingIds.has(m.id));
    if (fresh.length === 0) continue;
    // Cast: adapter accepts our shape; types differ slightly across versions.
    await memoryStore.saveMessages({ messages: fresh as never });
    messagesCopied += fresh.length;
  }
}

console.log(`Copied ${threadsCopied} new threads / ${messagesCopied} new messages.`);

function safeJSON(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function parseMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

process.exit(0);
