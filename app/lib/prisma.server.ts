import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { resolveRuntimePostgresUrl } from "~/lib/postgres-url.server";

/**
 * Singleton PrismaClient. Re-used across Vite/React Router HMR reloads via
 * `globalThis` so we don't leak DB handles in dev.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const url = resolveRuntimePostgresUrl();
  const adapter = new PrismaPg(url);
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
