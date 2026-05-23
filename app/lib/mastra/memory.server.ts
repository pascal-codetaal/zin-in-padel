import fs from "node:fs";
import path from "node:path";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";

/**
 * Resolve the project root by walking up from `start` until we find a
 * `package.json` that belongs to *this* project. Two reasons we can't just
 * grab the first `package.json` we see:
 *
 * 1. `mastra dev` bundles the agent into `.mastra/output/` and writes a
 *    stub `package.json` there (`name: "server"`). If we matched on that,
 *    `data/mastra-memory.db` would land inside `.mastra/output/`, and the
 *    Studio process + the app process would write to *different* DB files —
 *    Studio would never see the WhatsApp conversation memory.
 *
 * 2. `process.cwd()` differs between `pnpm dev` (project root) and
 *    `mastra dev` (somewhere inside `.mastra/`), so we have to walk up.
 *
 * We anchor on the existence of `prisma/schema.prisma` which only ever lives
 * at the real project root and is not copied into `.mastra/output/`.
 */
function findProjectRoot(start: string): string {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    dir = path.dirname(dir);
  }
  return start;
}

function resolveDbUrl(): string {
  if (process.env.MASTRA_MEMORY_DB_URL) return process.env.MASTRA_MEMORY_DB_URL;
  const root = findProjectRoot(process.cwd());
  const dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return `file:${path.join(dataDir, "mastra-memory.db")}`;
}

let storage: LibSQLStore | null = null;
let memory: Memory | null = null;

/**
 * The file-backed LibSQL store. Registered on the Mastra instance as the
 * project-wide storage adapter; the Memory below picks it up automatically.
 */
export function getMastraStorage(): LibSQLStore {
  if (!storage) {
    storage = new LibSQLStore({
      id: "favorites-memory",
      url: resolveDbUrl(),
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
 *
 * Why: a single place to swap LibSQL → Postgres without touching
 * Memory or Agent code.
 */
export function getFavoritesMemory(): Memory {
  if (!memory) {
    memory = new Memory({
      options: {
        // Replay the last 20 turns from the thread on every generate call.
        lastMessages: 20,
        // No vector search / semantic recall — file-local SQLite, POC scope.
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
