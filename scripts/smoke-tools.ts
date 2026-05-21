// Smoke test for profile tools — calls execute() directly,
// no LLM round-trip required. Run with: npx tsx scripts/smoke-tools.ts
//
// Persistence: the smoke run inserts a dedicated test user + cleans up
// everything (user cascades through favorites/messages; the test player
// is removed at the end). The rest of the DB is untouched.
import { RequestContext } from "@mastra/core/request-context";
import { prisma } from "../app/lib/prisma.server";
import {
  addFriendTool,
  readProfileTool,
} from "../app/lib/mastra/agents/favoritePlayers/tools.server";

const TEST_USER_ID = "smoke-test-user";
const TEST_USER_WA_ID = "31000000000";
const TEST_PLAYER_PHONE = "+32470123456";

async function cleanup(): Promise<void> {
  // User cascade removes favorites + messages.
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  // Player rows are shared — only remove the one this smoke test introduced
  // (if no other user still references it).
  const refs = await prisma.userFavorite.count({
    where: { playerRef: TEST_PLAYER_PHONE },
  });
  if (refs === 0) {
    await prisma.player.deleteMany({ where: { ref: TEST_PLAYER_PHONE } });
  }
}

async function seedTestUser(): Promise<string> {
  await cleanup();
  const now = new Date();
  await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      manageToken: "smoketestmanage0001",
      waId: TEST_USER_WA_ID,
      phone: `whatsapp:+${TEST_USER_WA_ID}`,
      profileName: "Smoke Tester",
      optedIn: true,
      onboardingComplete: false,
      activeFlow: "onboarding",
      createdAt: now,
      updatedAt: now,
    },
  });
  return TEST_USER_ID;
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
    assert(
      after.favoritePlayers[0].phone === TEST_PLAYER_PHONE,
      "phone stored",
    );
    console.log("✓ read-profile: reflects writes");

    console.log("\nALL SMOKE TESTS PASSED");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
