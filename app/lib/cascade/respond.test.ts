import { describe, expect, it } from "vitest";
import { decideInviteResponse } from "./respond";
import { makeInvite, makeMatch } from "./test-fixtures";

const NOW = new Date("2026-05-30T10:00:00.000Z");
const FUTURE_MATCH = { scheduledAt: "2026-06-01T19:00:00.000Z" };
const PAST_MATCH = { scheduledAt: "2026-05-30T09:59:59.000Z" };

describe("decideInviteResponse — accept", () => {
  it("applies accept when match has open slots and invite is pending", () => {
    const match = makeMatch({
      ...FUTURE_MATCH,
      confirmedSlotNames: ["Organiser"],
      invitedPlayers: [makeInvite({ status: "pending" })],
    });

    const decision = decideInviteResponse({
      match,
      inviteStatus: "pending",
      action: "accept",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "apply", newStatus: "accepted" });
  });

  it("rejects accept when match is full", () => {
    const match = makeMatch({
      ...FUTURE_MATCH,
      confirmedSlotNames: ["A", "B", "C"],
      invitedPlayers: [makeInvite({ status: "accepted" })],
    });

    const decision = decideInviteResponse({
      match,
      inviteStatus: "pending",
      action: "accept",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "reject", reason: "match-full" });
  });

  it("is idempotent when already accepted", () => {
    const match = makeMatch(FUTURE_MATCH);
    const decision = decideInviteResponse({
      match,
      inviteStatus: "accepted",
      action: "accept",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "idempotent", status: "accepted" });
  });

  it("allows accept after declining (undo flow)", () => {
    const match = makeMatch(FUTURE_MATCH);
    const decision = decideInviteResponse({
      match,
      inviteStatus: "declined",
      action: "accept",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "apply", newStatus: "accepted" });
  });
});

describe("decideInviteResponse — decline", () => {
  it("applies decline when invite is pending", () => {
    const match = makeMatch(FUTURE_MATCH);
    const decision = decideInviteResponse({
      match,
      inviteStatus: "pending",
      action: "decline",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "apply", newStatus: "declined" });
  });

  it("is idempotent when already declined", () => {
    const match = makeMatch(FUTURE_MATCH);
    const decision = decideInviteResponse({
      match,
      inviteStatus: "declined",
      action: "decline",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "idempotent", status: "declined" });
  });

  it("allows decline even when match is full", () => {
    const match = makeMatch({
      ...FUTURE_MATCH,
      confirmedSlotNames: ["A", "B", "C", "D"],
    });
    const decision = decideInviteResponse({
      match,
      inviteStatus: "pending",
      action: "decline",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "apply", newStatus: "declined" });
  });

  it("allows decline after accepting (changed mind)", () => {
    const match = makeMatch(FUTURE_MATCH);
    const decision = decideInviteResponse({
      match,
      inviteStatus: "accepted",
      action: "decline",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "apply", newStatus: "declined" });
  });
});

describe("decideInviteResponse — guards", () => {
  it("rejects when match is cancelled", () => {
    const match = makeMatch({ ...FUTURE_MATCH, status: "cancelled" });
    const decision = decideInviteResponse({
      match,
      inviteStatus: "pending",
      action: "accept",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "reject", reason: "match-cancelled" });
  });

  it("rejects when match start time has passed", () => {
    const match = makeMatch(PAST_MATCH);
    const decision = decideInviteResponse({
      match,
      inviteStatus: "pending",
      action: "accept",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "reject", reason: "match-started" });
  });

  it("rejects when invite has expired", () => {
    const match = makeMatch(FUTURE_MATCH);
    const decision = decideInviteResponse({
      match,
      inviteStatus: "expired",
      action: "accept",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "reject", reason: "invite-expired" });
  });

  it("guards trump idempotency — cancelled wins over already-accepted", () => {
    const match = makeMatch({ ...FUTURE_MATCH, status: "cancelled" });
    const decision = decideInviteResponse({
      match,
      inviteStatus: "accepted",
      action: "accept",
      now: NOW,
    });

    expect(decision).toEqual({ kind: "reject", reason: "match-cancelled" });
  });
});
