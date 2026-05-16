// Smoke test for Mastra favorites tools — calls execute() directly,
// no LLM round-trip required. Run with: npx tsx scripts/smoke-tools.ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createFavoritesTools } from "../app/lib/mastra/tools.server";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

async function backup(): Promise<string> {
  return await readFile(DB_PATH, "utf-8");
}

async function restore(snapshot: string): Promise<void> {
  await writeFile(DB_PATH, snapshot, "utf-8");
}

async function seedTestUser(): Promise<string> {
  const raw = JSON.parse(await readFile(DB_PATH, "utf-8"));
  const userId = "smoke-test-user";
  raw.users = [
    {
      id: userId,
      waId: "31000000000",
      phone: "whatsapp:+31000000000",
      profileName: "Smoke Tester",
      optedIn: true,
      onboardingComplete: true,
      onboardingStep: 1,
      activeFlow: "favorites",
      favoritePlayerPhones: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  raw.players = [];
  raw.messages = [];
  await writeFile(DB_PATH, JSON.stringify(raw, null, 2) + "\n", "utf-8");
  return userId;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT FAIL: " + msg);
}

async function main() {
  const snap = await backup();
  try {
    const userId = await seedTestUser();
    const { readDb, addFavorite } = createFavoritesTools(userId);

    // 1. readDb on fresh user
    const before = await (readDb as any).execute({});
    assert(before.currentUser?.id === userId, "currentUser found");
    assert(before.favoritePlayers.length === 0, "no favorites yet");
    assert(before.allPlayers.length === 0, "no players yet");
    console.log("✓ readDb: clean state");

    // 2. addFavorite with bad phone
    const bad = await (addFavorite as any).execute({
      name: "Foo",
      phone: "0612345678",
    });
    assert(bad.ok === false && bad.error === "phone_not_e164", "rejects non-E164");
    console.log("✓ addFavorite: rejects 06... format");

    // 3. addFavorite with good phone
    const good = await (addFavorite as any).execute({
      name: "Marieke",
      phone: "+31612345678",
    });
    assert(good.ok === true, "accepts E164");
    assert(good.player?.name === "Marieke", "player returned");
    assert(good.alreadyFavorite === false, "not duplicate");
    console.log("✓ addFavorite: accepts +31...");

    // 4. duplicate add
    const dup = await (addFavorite as any).execute({
      name: "Marieke",
      phone: "+31612345678",
    });
    assert(dup.ok === true && dup.alreadyFavorite === true, "duplicate flagged");
    console.log("✓ addFavorite: dedup works");

    // 5. readDb shows the favorite
    const after = await (readDb as any).execute({});
    assert(after.favoritePlayers.length === 1, "favorite persisted");
    assert(after.allPlayers.length === 1, "player persisted");
    console.log("✓ readDb: reflects writes");

    console.log("\nALL SMOKE TESTS PASSED");
  } finally {
    await restore(snap);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
