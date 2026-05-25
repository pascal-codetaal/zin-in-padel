/**
 * End-to-end smoke test for Phase G organiser controls (G1–G5).
 *
 * Exercises the full happy path against the live DB:
 *   1. seed organiser + 3 invitee Users + 3 Player rows + favourites
 *   2. create + finalize a Match (phase 1 fires invites)
 *   3. one invitee accepts via /i/{token} adapter
 *   4. G4: organiser adds a non-User confirmed slot ("Klaas")
 *   5. G3: organiser removes the accepted invitee → expects WhatsApp DM
 *   6. G3: organiser removes the confirmed-slot name
 *   7. G1: organiser skips to phase 2
 *   8. G5: assert one decline exists after a fresh decline
 *   9. G2: organiser cancels match → all live invites flipped to 'expired',
 *      all surviving live invitees notified
 *
 * After every step we re-load the Match and assert the visible state. The
 * script cleans up every row it created on success or failure.
 *
 * Run with: pnpm tsx scripts/smoke-organiser-controls.ts
 */

import { prisma } from "../app/lib/prisma.server";
import {
  finalizeMatchDraft,
  findOrCreateDraftMatch,
  updateMatchDraft,
  getMessagesForUser,
} from "../app/lib/db.server";
import { dispatchPendingInvites } from "../app/lib/cascade/send.server";
import { respondToInvite } from "../app/lib/cascade/respond.server";
import {
  addConfirmedSlotToMatch,
  cancelMatchAsOrganiser,
  removePlayerFromMatch,
  skipCascadePhase,
} from "../app/lib/cascade/organiser.server";

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const TAG = "smoke-organiser";
const NOW = new Date();

const ORGANISER = {
  id: `${TAG}-organiser`,
  waId: "31999990001",
  phone: "whatsapp:+31999990001",
  manageToken: `${TAG}-mt-organiser000000`,
  profileName: "Smoke Organiser",
};

const INVITEES = [
  {
    id: `${TAG}-friend-a`,
    waId: "31999990010",
    phone: "whatsapp:+31999990010",
    bare: "+31999990010",
    manageToken: `${TAG}-mt-friend-a000000`,
    profileName: "Friend Alpha",
  },
  {
    id: `${TAG}-friend-b`,
    waId: "31999990011",
    phone: "whatsapp:+31999990011",
    bare: "+31999990011",
    manageToken: `${TAG}-mt-friend-b000000`,
    profileName: "Friend Beta",
  },
  {
    id: `${TAG}-friend-c`,
    waId: "31999990012",
    phone: "whatsapp:+31999990012",
    bare: "+31999990012",
    manageToken: `${TAG}-mt-friend-c000000`,
    profileName: "Friend Gamma",
  },
];

const USER_IDS = [ORGANISER.id, ...INVITEES.map((i) => i.id)];
const PLAYER_REFS = INVITEES.map((i) => i.bare);

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT FAIL: " + msg);
}

function step(n: number, label: string): void {
  console.log(`\n— step ${n}: ${label} —`);
}

async function cleanup(): Promise<void> {
  // Match cascades through invitedPlayers, confirmedSlots, clubs join.
  await prisma.match.deleteMany({ where: { organizerId: ORGANISER.id } });
  // Messages cascade through User, but the smoke also writes to invitees.
  await prisma.message.deleteMany({ where: { userId: { in: USER_IDS } } });
  // UserFavorite cascades through User; we delete users next.
  await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
  // Only delete a Player if no remaining UserFavorite references it.
  for (const ref of PLAYER_REFS) {
    const refs = await prisma.userFavorite.count({
      where: { playerRef: ref },
    });
    if (refs === 0) {
      await prisma.player.deleteMany({ where: { ref } });
    }
  }
}

async function seed(clubId: string): Promise<void> {
  await cleanup();

  await prisma.user.create({
    data: {
      id: ORGANISER.id,
      manageToken: ORGANISER.manageToken,
      waId: ORGANISER.waId,
      phone: ORGANISER.phone,
      profileName: ORGANISER.profileName,
      firstName: "Smoke",
      lastName: "Organiser",
      optedIn: true,
      onboardingComplete: true,
      activeFlow: null,
      gender: "m",
      level: 300,
      matchPreference: "open",
      createdAt: NOW,
      updatedAt: NOW,
      preferredClubs: { create: [{ clubId }] },
    },
  });

  for (const i of INVITEES) {
    await prisma.user.create({
      data: {
        id: i.id,
        manageToken: i.manageToken,
        waId: i.waId,
        phone: i.phone,
        profileName: i.profileName,
        firstName: i.profileName.split(" ")[0]!,
        lastName: i.profileName.split(" ")[1] ?? null,
        optedIn: true,
        onboardingComplete: true,
        activeFlow: null,
        gender: "m",
        level: 300,
        matchPreference: "open",
        createdAt: NOW,
        updatedAt: NOW,
        preferredClubs: { create: [{ clubId }] },
      },
    });
    await prisma.player.upsert({
      where: { ref: i.bare },
      create: { ref: i.bare, phone: i.bare, name: i.profileName },
      update: { name: i.profileName },
    });
    await prisma.userFavorite.create({
      data: { userId: ORGANISER.id, playerRef: i.bare },
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                      */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const club = await prisma.club.findFirst();
  assert(club, "at least one Club must exist (run pnpm prisma db seed)");
  console.log(`using club: ${club.name} (${club.id})`);

  await seed(club.id);

  /* ---- 2. create + finalize match (phase 1 fires) ------------------------ */
  step(2, "create + finalize match");

  const draft = await findOrCreateDraftMatch(ORGANISER.id);
  await updateMatchDraft(draft.id, {
    scheduledAt: new Date(NOW.getTime() + 6 * 24 * 3600 * 1000).toISOString(),
    durationMinutes: 90,
    format: "men_only",
    totalSlots: 4,
    confirmedSlotNames: ["Smoke Organiser"],
    invitedFriendRefs: PLAYER_REFS,
    fallbackToLevelRange: true,
    fallbackLevelMin: 200,
    fallbackLevelMax: 400,
    fallbackLevelDelayMinutes: 30,
    fallbackToEveryone: true,
    fallbackEveryoneDelayMinutes: 60,
  });

  const finalized = await finalizeMatchDraft(draft.id);
  assert(
    finalized.currentCascadePhase === 1,
    `phase 1 should be active after finalize, got ${finalized.currentCascadePhase}`,
  );
  assert(
    finalized.invitedPlayers.length === 3,
    `expected 3 phase-1 invites, got ${finalized.invitedPlayers.length}`,
  );

  await dispatchPendingInvites(draft.id, NOW);
  const msgsA = await getMessagesForUser(INVITEES[0]!.id);
  assert(msgsA.length >= 1, "invitee A should have received invite message");
  console.log("✓ phase 1 invites dispatched");

  /* ---- 3. one invitee accepts via /i/{token} adapter --------------------- */
  step(3, "invitee A accepts");

  const reloaded = await prisma.match.findUniqueOrThrow({
    where: { id: draft.id },
    include: { invitedPlayers: true },
  });
  const inviteA = reloaded.invitedPlayers.find(
    (p) => p.playerRef === INVITEES[0]!.bare,
  );
  assert(inviteA, "invite for A must exist");
  const acceptResult = await respondToInvite({
    token: inviteA.token,
    action: "accept",
    now: NOW,
  });
  assert(acceptResult, "accept result must be non-null");
  assert(
    acceptResult.decision.kind === "apply",
    `accept should apply, got ${acceptResult.decision.kind}`,
  );
  console.log("✓ invitee A accepted");

  /* ---- 4. G4: organiser adds a non-User confirmed slot ------------------- */
  step(4, "G4 — add confirmed slot 'Klaas'");

  const addResult = await addConfirmedSlotToMatch({
    matchId: draft.id,
    name: "Klaas",
    now: NOW,
  });
  assert(addResult && addResult.plan.kind === "add", "add plan should fire");
  assert(
    addResult.match.confirmedSlotNames.includes("Klaas"),
    "Klaas should be in confirmedSlotNames",
  );

  // capacity guard: 4/4 now (Smoke Organiser + Klaas confirmed + A accepted + 0)
  // Actually: 2 confirmed + 1 accepted = 3/4, so adding "Lisa" should still work
  // — but adding any second name on top of A's accept fills it.
  const addOverflow = await addConfirmedSlotToMatch({
    matchId: draft.id,
    name: "Lisa",
    now: NOW,
  });
  assert(
    addOverflow && addOverflow.plan.kind === "add",
    "Lisa add should still fit (3/4 before)",
  );
  const addFifth = await addConfirmedSlotToMatch({
    matchId: draft.id,
    name: "Marie",
    now: NOW,
  });
  assert(
    addFifth && addFifth.plan.kind === "no-op" && addFifth.plan.reason === "match-full",
    "5th add should be rejected as match-full",
  );

  // dedupe guard
  const addDup = await addConfirmedSlotToMatch({
    matchId: draft.id,
    name: "klaas",
    now: NOW,
  });
  assert(
    addDup && addDup.plan.kind === "no-op" && addDup.plan.reason === "duplicate-name",
    "case-insensitive duplicate should be no-op",
  );
  console.log("✓ G4 add-confirmed-slot: capacity + dedupe enforced");

  /* ---- 5. G3: remove the accepted invitee → expect WhatsApp -------------- */
  step(5, "G3 — remove accepted invitee A");

  const msgsBeforeRemoveA = (await getMessagesForUser(INVITEES[0]!.id)).length;
  const removeAccepted = await removePlayerFromMatch({
    matchId: draft.id,
    playerRef: INVITEES[0]!.bare,
    now: NOW,
  });
  assert(
    removeAccepted && removeAccepted.plan.kind === "remove",
    "remove-accepted plan should fire",
  );
  if (removeAccepted.plan.kind === "remove") {
    assert(
      removeAccepted.plan.from === "accepted-invite",
      "should be removed from accepted-invite",
    );
  }
  const msgsAfterRemoveA = (await getMessagesForUser(INVITEES[0]!.id)).length;
  assert(
    msgsAfterRemoveA > msgsBeforeRemoveA,
    `invitee A should get a 'removed' WhatsApp (${msgsBeforeRemoveA} → ${msgsAfterRemoveA})`,
  );

  const inviteAAfter = await prisma.matchInvitedPlayer.findFirstOrThrow({
    where: { matchId: draft.id, playerRef: INVITEES[0]!.bare },
  });
  assert(
    inviteAAfter.status === "declined",
    `removed invite should flip to declined, got ${inviteAAfter.status}`,
  );
  console.log("✓ G3 remove accepted: slot freed + WhatsApp sent");

  /* ---- 6. G3: remove a confirmed-slot name (no notification) ------------- */
  step(6, "G3 — remove confirmed-slot 'Klaas'");

  const removeConfirmed = await removePlayerFromMatch({
    matchId: draft.id,
    confirmedSlotName: "Klaas",
    now: NOW,
  });
  assert(
    removeConfirmed && removeConfirmed.plan.kind === "remove",
    "remove-confirmed plan should fire",
  );
  if (removeConfirmed.plan.kind === "remove") {
    assert(
      removeConfirmed.plan.from === "confirmed-slot",
      "should be removed from confirmed-slot",
    );
    assert(
      removeConfirmed.plan.notifications.length === 0,
      "confirmed-slot removal sends no notifications",
    );
  }
  assert(
    !removeConfirmed.match.confirmedSlotNames.includes("Klaas"),
    "Klaas should no longer be in confirmedSlotNames",
  );
  console.log("✓ G3 remove confirmed-slot: silent removal");

  /* ---- 7. G1: skip-phase nudges nextCascadeAt=now ------------------------ */
  step(7, "G1 — skip to next phase");

  const skipResult = await skipCascadePhase({ matchId: draft.id, now: NOW });
  assert(skipResult, "skip should resolve");
  assert(
    skipResult.plan.kind === "skip",
    `skip plan should fire, got ${skipResult.plan.kind}`,
  );
  if (skipResult.plan.kind === "skip") {
    assert(
      skipResult.plan.nextPhase === 2,
      `next phase should be 2, got ${skipResult.plan.nextPhase}`,
    );
  }
  assert(
    skipResult.match.nextCascadeAt !== null &&
      new Date(skipResult.match.nextCascadeAt).getTime() <= NOW.getTime() + 100,
    "nextCascadeAt should be nudged to now",
  );
  console.log("✓ G1 skip-phase: nextCascadeAt nudged to now");

  /* ---- 8. G5: ensure a decline is visible on the match ------------------- */
  step(8, "G5 — invitee B declines, surfaces in decline list");

  const inviteB = await prisma.matchInvitedPlayer.findFirstOrThrow({
    where: { matchId: draft.id, playerRef: INVITEES[1]!.bare },
  });
  const declineResult = await respondToInvite({
    token: inviteB.token,
    action: "decline",
    now: NOW,
  });
  assert(declineResult, "decline result must be non-null");
  assert(
    declineResult.decision.kind === "apply",
    `decline should apply, got ${declineResult.decision.kind}`,
  );
  const matchWithDeclines = await prisma.match.findUniqueOrThrow({
    where: { id: draft.id },
    include: { invitedPlayers: true },
  });
  const declines = matchWithDeclines.invitedPlayers.filter(
    (i) => i.status === "declined",
  );
  // Removed A (now 'declined') + declined B
  assert(
    declines.length >= 2,
    `expected ≥2 declines (removed A + declined B), got ${declines.length}`,
  );
  console.log(`✓ G5 declines visible (${declines.length} total)`);

  /* ---- 9. G2: cancel match — drain + notify ------------------------------ */
  step(9, "G2 — cancel match");

  const msgsBeforeCancelC = (await getMessagesForUser(INVITEES[2]!.id)).length;
  const cancelResult = await cancelMatchAsOrganiser({
    matchId: draft.id,
    now: NOW,
  });
  assert(cancelResult, "cancel should resolve");
  assert(
    cancelResult.plan.kind === "cancel",
    `cancel plan should fire, got ${cancelResult.plan.kind}`,
  );
  assert(
    cancelResult.match.status === "cancelled",
    "match status should be 'cancelled'",
  );

  // Invitee C was still 'pending' → should get a cancel notification.
  const msgsAfterCancelC = (await getMessagesForUser(INVITEES[2]!.id)).length;
  assert(
    msgsAfterCancelC > msgsBeforeCancelC,
    `invitee C should receive cancel notification (${msgsBeforeCancelC} → ${msgsAfterCancelC})`,
  );

  // C's invite should now be expired.
  const inviteCAfter = await prisma.matchInvitedPlayer.findFirstOrThrow({
    where: { matchId: draft.id, playerRef: INVITEES[2]!.bare },
  });
  assert(
    inviteCAfter.status === "expired",
    `pending invite for C should expire, got ${inviteCAfter.status}`,
  );

  // Cascade is shut down.
  assert(
    cancelResult.match.nextCascadeAt === null,
    "nextCascadeAt should be nulled on cancel",
  );
  console.log("✓ G2 cancel: tokens expired + notifications sent");

  console.log("\nALL ORGANISER-CONTROL SMOKE TESTS PASSED");
}

main()
  .then(async () => {
    await cleanup();
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await cleanup().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
