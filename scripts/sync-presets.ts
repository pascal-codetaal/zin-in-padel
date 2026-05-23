/**
 * Regenerate presets.json from real (non-seed) users in the DB.
 * Mastra Studio uses these presets to populate `userId` in tool calls.
 *
 * Run: pnpm presets:sync
 */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../app/lib/prisma.server";

async function main() {
  const users = await prisma.user.findMany({
    where: { waId: { not: { startsWith: "seed-" } } },
    select: { id: true, profileName: true, waId: true },
    orderBy: { profileName: "asc" },
  });

  const presets: Record<string, { userId: string }> = {};
  for (const u of users) {
    const name = (u.profileName ?? "").trim() || u.waId;
    let label = `${name} (${u.waId})`;
    // Disambiguate duplicate labels (shouldn't happen but be safe).
    let n = 2;
    while (presets[label]) label = `${name} (${u.waId}) #${n++}`;
    presets[label] = { userId: u.id };
  }

  const out = resolve(process.cwd(), "presets.json");
  await writeFile(out, JSON.stringify(presets, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(presets).length} presets to ${out}`);
}

main().finally(() => prisma.$disconnect());
