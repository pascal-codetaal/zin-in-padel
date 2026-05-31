/**
 * Tests for `planCascadeTick` — the pure planner that bridges decideCascadePhase
 * + buildPhaseAudience into a persistence plan the runner applies blindly.
 */

import { describe, expect, it } from "vitest";
import { planCascadeTick } from "./plan";
import { makeMatch, makeUser } from "./test-fixtures";
import type { AudienceCandidate, AudienceIndex } from "./audience";

const NOW = new Date("2026-05-30T18:00:00.000Z");

function emptyIndex(): AudienceIndex {
  return {
    alreadyInvitedRefs: new Set(),
    declinedRefs: new Set(),
    friendRefs: new Set(),
    conflictingRefs: new Set(),
    onCourtRefs: new Set(),
  };
}

describe("planCascadeTick", () => {
  it("fires phase 1 to opted-in friends when match is due and no phase has fired", () => {
    const jan = makeUser({ id: "u_jan", phone: "whatsapp:+32470000010" });
    const piet = makeUser({ id: "u_piet", phone: "whatsapp:+32470000011" });

    const match = makeMatch({
      invitedFriendRefs: ["+32470000010", "+32470000011"],
      nextCascadeAt: NOW.toISOString(),
      fallbackToLevelRange: true,
      fallbackLevelDelayMinutes: 30,
    });

    const candidates: AudienceCandidate[] = [
      { user: jan, ref: "+32470000010" },
      { user: piet, ref: "+32470000011" },
    ];
    const index: AudienceIndex = {
      ...emptyIndex(),
      friendRefs: new Set(["+32470000010", "+32470000011"]),
    };

    const plan = planCascadeTick(match, candidates, index, NOW);

    expect(plan.kind).toBe("fire-phase");
    if (plan.kind !== "fire-phase") return;
    expect(plan.phase).toBe(1);
    expect(plan.invitesToInsert).toHaveLength(2);
    expect(plan.invitesToInsert.map((i) => i.playerRef).sort()).toEqual([
      "+32470000010",
      "+32470000011",
    ]);
    expect(plan.invitesToInsert.every((i) => i.cascadePhase === 1)).toBe(true);
    expect(plan.invitesToInsert.every((i) => i.status === "pending")).toBe(true);
    expect(plan.invitesToInsert.every((i) => i.sentAt === null)).toBe(true);
    // Each row gets its own opaque token (22-char base62).
    const tokens = new Set(plan.invitesToInsert.map((i) => i.token));
    expect(tokens.size).toBe(2);
    expect([...tokens][0]).toMatch(/^[0-9A-Za-z]{22}$/);

    expect(plan.matchStateUpdate.currentCascadePhase).toBe(1);
    // Phase 2 scheduled at now + 30min.
    expect(plan.matchStateUpdate.nextCascadeAt?.toISOString()).toBe(
      "2026-05-30T18:30:00.000Z",
    );
  });

  it("marks the match full and clears nextCascadeAt when court is filled before tick", () => {
    const match = makeMatch({
      // 4 confirmed = court full; cascade should stop.
      confirmedSlotNames: ["Organiser", "A", "B", "C"],
      currentCascadePhase: 1,
      nextCascadeAt: NOW.toISOString(),
      fallbackToLevelRange: true,
      fallbackLevelDelayMinutes: 30,
    });

    const plan = planCascadeTick(match, [], emptyIndex(), NOW);

    expect(plan.kind).toBe("mark-full");
    if (plan.kind !== "mark-full") return;
    expect(plan.matchStateUpdate.nextCascadeAt).toBeNull();
    // Phase counter does not regress.
    expect(plan.matchStateUpdate.currentCascadePhase).toBe(1);
  });

  it("marks exhausted when no further fallback phase is configured", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      nextCascadeAt: NOW.toISOString(),
      fallbackToLevelRange: false,
      fallbackToEveryone: false,
    });

    const plan = planCascadeTick(match, [], emptyIndex(), NOW);

    expect(plan.kind).toBe("mark-exhausted");
    if (plan.kind !== "mark-exhausted") return;
    expect(plan.matchStateUpdate.nextCascadeAt).toBeNull();
  });

  it("returns idle when the cascade is not yet due", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      nextCascadeAt: "2026-05-30T18:30:00.000Z", // 30 min after NOW
      fallbackToLevelRange: true,
    });

    const plan = planCascadeTick(match, [], emptyIndex(), NOW);

    expect(plan).toEqual({ kind: "idle", reason: "not-yet-due" });
  });

  it("fires phase 2 with level-range invites and excludes already-invited friends", () => {
    const friendAlreadyInvited = makeUser({
      id: "u_jan",
      phone: "whatsapp:+32470000010",
      level: 300,
    });
    const inRange = makeUser({
      id: "u_kim",
      phone: "whatsapp:+32470000020",
      level: 300,
    });
    const outOfRange = makeUser({
      id: "u_max",
      phone: "whatsapp:+32470000021",
      level: 700,
    });

    const match = makeMatch({
      currentCascadePhase: 1,
      nextCascadeAt: NOW.toISOString(),
      fallbackToLevelRange: true,
      fallbackLevelMin: 200,
      fallbackLevelMax: 400,
      fallbackLevelDelayMinutes: 30,
      fallbackToEveryone: true,
      fallbackEveryoneDelayMinutes: 60,
    });

    const candidates: AudienceCandidate[] = [
      { user: friendAlreadyInvited, ref: "+32470000010" },
      { user: inRange, ref: "+32470000020" },
      { user: outOfRange, ref: "+32470000021" },
    ];
    const index: AudienceIndex = {
      ...emptyIndex(),
      alreadyInvitedRefs: new Set(["+32470000010"]),
    };

    const plan = planCascadeTick(match, candidates, index, NOW);

    expect(plan.kind).toBe("fire-phase");
    if (plan.kind !== "fire-phase") return;
    expect(plan.phase).toBe(2);
    expect(plan.invitesToInsert.map((i) => i.playerRef)).toEqual([
      "+32470000020",
    ]);
    expect(plan.invitesToInsert[0]!.cascadePhase).toBe(2);
    // Phase 3 scheduled at now + 60min (everyone-delay measured from phase-2 fire).
    expect(plan.matchStateUpdate.nextCascadeAt?.toISOString()).toBe(
      "2026-05-30T19:00:00.000Z",
    );
  });

  it("fires phase 2 with empty audience when nobody is eligible (no-op)", () => {
    const match = makeMatch({
      currentCascadePhase: 1,
      nextCascadeAt: NOW.toISOString(),
      fallbackToLevelRange: true,
      fallbackLevelMin: 200,
      fallbackLevelMax: 400,
      fallbackLevelDelayMinutes: 30,
    });

    const plan = planCascadeTick(match, [], emptyIndex(), NOW);

    expect(plan.kind).toBe("fire-phase");
    if (plan.kind !== "fire-phase") return;
    expect(plan.invitesToInsert).toEqual([]);
    // Phase counter still advances — empty audience must not loop.
    expect(plan.matchStateUpdate.currentCascadePhase).toBe(2);
  });
});
