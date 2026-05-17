/**
 * One-off: add stable `id` to each entry in data/padelclubs_vlaanderen.json
 * Run: npx tsx scripts/add-club-ids.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RawClub = {
  id?: string;
  naam: string;
  locatie: string;
  provincie: string;
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function makeId(naam: string, locatie: string, used: Set<string>): string {
  const base = slugify(`${naam}-${locatie}`) || "club";
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix++}`;
  }
  used.add(id);
  return id;
}

async function main() {
  const filePath = path.join(
    process.cwd(),
    "data",
    "padelclubs_vlaanderen.json",
  );
  const raw = JSON.parse(await readFile(filePath, "utf-8")) as RawClub[];
  const used = new Set<string>();

  const withIds = raw.map((club) => ({
    id: club.id ?? makeId(club.naam, club.locatie, used),
    naam: club.naam,
    locatie: club.locatie,
    provincie: club.provincie,
  }));

  await writeFile(filePath, `${JSON.stringify(withIds, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${withIds.length} clubs with ids to ${filePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
