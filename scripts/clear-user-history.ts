/**
 * Clear all message history for a given user:
 *  - Postgres `Message` rows (WhatsApp audit log)
 *  - Mastra Memory thread (LibSQL agent memory, keyed by user.id)
 *
 * Run: npx tsx scripts/clear-user-history.ts <userId>
 */
import "dotenv/config";
import { deleteMessagesForUser } from "../app/lib/db.server";
import { deleteAgentThread } from "../app/lib/mastra/memory.server";
import { prisma } from "../app/lib/prisma.server";

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

  const count = await deleteMessagesForUser(userId);
  console.log(`  Postgres: deleted ${count} Message row(s)`);

  if (await deleteAgentThread(userId)) {
    console.log(`  Mastra Memory: deleted thread "${userId}"`);
  } else {
    console.log(`  Mastra Memory: no thread or already gone`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
