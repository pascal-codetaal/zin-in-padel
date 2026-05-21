// Smoke test for profile tools — calls execute() directly,
// no LLM round-trip required. Run with: npx tsx scripts/smoke-tools.ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RequestContext } from "@mastra/core/request-context";
import {
  addFriendTool,
  readProfileTool,
} from "../app/lib/mastra/agents/favoritePlayers/tools.server";

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
      manageToken: "smoketestmanage0001",
      waId: "31000000000",
      phone: "whatsapp:+31000000000",
      profileName: "Smoke Tester",
      optedIn: true,
      onboardingComplete: false,
      activeFlow: "onboarding",
      pendingFriend: null,
      level: null,
      favoritePlayerRefs: [],
      preferredClubIds: [],
      matchPreference: null,
      matchLevelMin: null,
      matchLevelMax: null,
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

    const before = await (readProfileTool as any).execute({}, ctx);
    assert(before.currentUser?.id === userId, "currentUser found");
    assert(before.favoritePlayers.length === 0, "no favorites yet");
    console.log("✓ read-profile: clean state");

    const needsPhone = await (addFriendTool as any).execute(
      { name: "Pascal Van Hecke", nameOnly: true },
      ctx,
    );
    assert(
      needsPhone.ok === true && needsPhone.status === "pending_phone",
      "name only waits for phone",
    );
    console.log("✓ add-friend: asks for phone");

    const added = await (addFriendTool as any).execute(
      { name: "Pascal Van Hecke", phone: "0470123456" },
      ctx,
    );
    assert(added.ok === true && added.status === "added", "name + phone adds");
    console.log("✓ add-friend: adds with phone");

    const after = await (readProfileTool as any).execute({}, ctx);
    assert(after.favoritePlayers.length === 1, "favorite persisted");
    assert(after.favoritePlayers[0].phone === "+32470123456", "phone stored");
    console.log("✓ read-profile: reflects writes");

    console.log("\nALL SMOKE TESTS PASSED");
  } finally {
    await restore(snap);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
