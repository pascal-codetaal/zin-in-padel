// Smoke test for Mastra favorites tools — calls execute() directly,
// no LLM round-trip required. Run with: npx tsx scripts/smoke-tools.ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RequestContext } from "@mastra/core/request-context";
import { addFavoriteTool, readDbTool } from "../app/lib/mastra/agents/favoritePlayers/tools.server";

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

function ctxFor(userId: string) {
  const requestContext = new RequestContext();
  requestContext.set("userId", userId);
  return { requestContext };
}

async function main() {
  const snap = await backup();
  try {
    const userId = await seedTestUser();
    const ctx = ctxFor(userId);

    // 1. readDb on fresh user
    const before = await (readDbTool as any).execute({}, ctx);
    assert(before.currentUser?.id === userId, "currentUser found");
    assert(before.favoritePlayers.length === 0, "no favorites yet");
    assert(before.allPlayers.length === 0, "no players yet");
    console.log("✓ readDb: clean state");

    // 2. addFavorite (any phone format accepted)
    const good = await (addFavoriteTool as any).execute(
      { name: "Marieke", phone: "0612345678" },
      ctx,
    );
    assert(good.ok === true, "accepts arbitrary phone");
    assert(good.player?.name === "Marieke", "player returned");
    assert(good.alreadyFavorite === false, "not duplicate");
    console.log("✓ addFavorite: accepts any phone format");

    // 3. duplicate add
    const dup = await (addFavoriteTool as any).execute(
      { name: "Marieke", phone: "0612345678" },
      ctx,
    );
    assert(dup.ok === true && dup.alreadyFavorite === true, "duplicate flagged");
    console.log("✓ addFavorite: dedup works");

    // 4. readDb shows the favorite
    const after = await (readDbTool as any).execute({}, ctx);
    assert(after.favoritePlayers.length === 1, "favorite persisted");
    assert(after.allPlayers.length === 1, "player persisted");
    console.log("✓ readDb: reflects writes");

    // 5. no userId → returns error
    const noCtx = await (addFavoriteTool as any).execute(
      { name: "Anon", phone: "999" },
      { requestContext: new RequestContext() },
    );
    assert(noCtx.ok === false && noCtx.error === "no_user_context", "no userId rejected");
    console.log("✓ addFavorite: rejects missing userId");

    console.log("\nALL SMOKE TESTS PASSED");
  } finally {
    await restore(snap);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
