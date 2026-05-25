/**
 * Regenerate presets.json from real (non-seed) users in the DB.
 * Mastra Studio uses these presets to inject requestContext (userId, appOrigin)
 * so tools return the juiste persoonlijke links voor die gebruiker.
 *
 * Run: pnpm presets:sync
 */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../app/lib/prisma.server";

const DEFAULT_APP_ORIGIN = "http://localhost:5173";

async function main() {
  const appOrigin = process.env.APP_ORIGIN?.trim() || DEFAULT_APP_ORIGIN;

  const users = await prisma.user.findMany({
    where: { waId: { not: { startsWith: "seed-" } } },
    select: { id: true, profileName: true, waId: true, phone: true },
    orderBy: { profileName: "asc" },
  });

  const presets: Record<
    string,
    { userId: string; appOrigin: string; waId: string; phone: string }
  > = {};
  for (const u of users) {
    const name = (u.profileName ?? "").trim() || u.waId;
    let label = `${name} (${u.waId})`;
    // Disambiguate duplicate labels (shouldn't happen but be safe).
    let n = 2;
    while (presets[label]) label = `${name} (${u.waId}) #${n++}`;
    presets[label] = {
      userId: u.id,
      appOrigin,
      waId: u.waId,
      phone: u.phone,
    };
  }

  const out = resolve(process.cwd(), "presets.json");
  await writeFile(out, JSON.stringify(presets, null, 2) + "\n", "utf8");
  console.log(
    `Wrote ${Object.keys(presets).length} presets to ${out} (appOrigin=${appOrigin})`,
  );
}

main().finally(() => prisma.$disconnect());
