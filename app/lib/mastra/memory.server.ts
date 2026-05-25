import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";

/**
 * Storage adapter for Mastra (threads, messages, resources, workflows, …).
 *
 * We deliberately reuse the same Supabase Postgres as the rest of the app
 * (`DATABASE_URL`) so:
 *
 *  - Production agent conversations end up in the same DB Studio reads.
 *  - There's a single backup / source of truth.
 *  - Studio shows every WhatsApp user's chat, not just whichever local
 *    SQLite file happens to be on the laptop running Studio.
 *
 * Tables are created with `mastra_*` prefixes and don't collide with the
 * Prisma-managed schema.
 */
let storage: PostgresStore | null = null;
let memory: Memory | null = null;

function resolveConnectionString(): string {
  // Prefer MASTRA_MEMORY_DB_URL, then DATABASE_URL, then DIRECT_URL.
  // Many local setups use a direct db.*.supabase.co URL in DATABASE_URL; a
  // misconfigured DIRECT_URL (pooler host + user "postgres" instead of
  // "postgres.<project-ref>") causes Supabase "Tenant or user not found".
  const url =
    process.env.MASTRA_MEMORY_DB_URL ??
    process.env.DATABASE_URL ??
    process.env.DIRECT_URL;
  if (!url) {
    throw new Error(
      "Mastra memory storage: set DATABASE_URL (or MASTRA_MEMORY_DB_URL) — no Postgres connection string found.",
    );
  }
  return url;
}

/**
 * The Postgres-backed store. Registered on the Mastra instance as the
 * project-wide storage adapter; the Memory below picks it up automatically.
 */
export function getMastraStorage(): PostgresStore {
  if (!storage) {
    storage = new PostgresStore({
      id: "padel-memory",
      connectionString: resolveConnectionString(),
      max: 5,
    });
  }
  return storage;
}

/**
 * Shared Memory instance with **no own storage**. The storage is owned by
 * the Mastra instance (see `app/lib/mastra/index.ts`). When the Agent
 * resolves its Memory, Mastra injects its storage into it
 * (Agent.getMemory → `resolvedMemory.setStorage(mastra.getStorage())`
 * when `!hasOwnStorage`).
 */
export function getFavoritesMemory(): Memory {
  if (!memory) {
    memory = new Memory({
      options: {
        // Replay the last 20 turns from the thread on every generate call.
        lastMessages: 20,
        // No vector search / semantic recall — POC scope.
        semanticRecall: false,
        // Auto-generate a short thread title from the first user message so
        // threads show up with readable names in Mastra Studio's chat sidebar
        // instead of as blank UUID entries.
        generateTitle: true,
      },
    });
  }
  return memory;
}

/** Delete the Mastra thread for a user (`thread = user.id`). Returns false if none. */
export async function deleteAgentThread(threadId: string): Promise<boolean> {
  const mem = getFavoritesMemory();
  mem.setStorage(getMastraStorage());
  try {
    await mem.deleteThread(threadId);
    return true;
  } catch {
    return false;
  }
}
