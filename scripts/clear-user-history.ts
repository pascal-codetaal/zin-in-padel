/**
 * Clear all message history for a given user:
 *  - Postgres `Message` rows (WhatsApp audit log)
 *  - Mastra Memory thread (LibSQL agent memory, keyed by user.id)
 *
 * Run: npx tsx scripts/clear-user-history.ts <userId>
 */
import "dotenv/config";
import { prisma } from "../app/lib/prisma.server";
import { getFavoritesMemory, getMastraStorage } from "../app/lib/mastra/memory.server";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: npx tsx scripts/clear-user-history.ts <userId>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, waId: true, profileName: true },
  });
  if (!user) {
    console.error(`User ${userId} not found.`);
    process.exit(1);
  }
  console.log(`Clearing history for ${user.profileName} (${user.waId})`);

  const deleted = await prisma.message.deleteMany({ where: { userId } });
  console.log(`  Postgres: deleted ${deleted.count} Message row(s)`);

  // Memory.deleteThread() needs the Mastra storage wired up; do it explicitly.
  const memory = getFavoritesMemory();
  memory.setStorage(getMastraStorage());
  try {
    await memory.deleteThread(userId);
    console.log(`  Mastra Memory: deleted thread "${userId}"`);
  } catch (err) {
    console.log(`  Mastra Memory: no thread or already gone (${(err as Error).message})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
