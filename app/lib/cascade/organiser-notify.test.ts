import { describe, expect, it } from "vitest";
import {
  decideAcceptNotices,
  decideRunnerNotices,
} from "./organiser-notify";
import { makeInvite, makeMatch } from "./test-fixtures";

describe("decideAcceptNotices", () => {
  it("emits invitee-accepted on a normal accept that doesn't fill the match", () => {
    const prev = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["Organiser"],
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "pending" }),
      ],
    });
    const next = makeMatch({
      ...prev,
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "accepted" }),
      ],
    });

    const notices = decideAcceptNotices({
      prev,
      next,
      acceptedPlayerRef: "+32490000001",
    });

    expect(notices).toEqual([
      { kind: "invitee-accepted", playerRef: "+32490000001" },
    ]);
  });

  it("emits invitee-accepted + match-full when the accept seals the last slot", () => {
    const prev = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["Organiser", "Klaas", "Pieter"],
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "pending" }),
      ],
    });
    const next = makeMatch({
      ...prev,
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "accepted" }),
      ],
    });

    const notices = decideAcceptNotices({
      prev,
      next,
      acceptedPlayerRef: "+32490000001",
    });

    expect(notices).toEqual([
      { kind: "invitee-accepted", playerRef: "+32490000001" },
      { kind: "match-full" },
    ]);
  });

  it("emits nothing if the match was already full before the accept (defensive)", () => {
    const full = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["Organiser", "A", "B", "C"],
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "accepted" }),
      ],
    });

    const notices = decideAcceptNotices({
      prev: full,
      next: full,
      acceptedPlayerRef: "+32490000001",
    });

    expect(notices).toEqual([]);
  });
});

describe("decideRunnerNotices", () => {
  it("emits match-full on a mark-full plan", () => {
    const match = makeMatch();
    const notices = decideRunnerNotices({ match, planKind: "mark-full" });
    expect(notices).toEqual([{ kind: "match-full" }]);
  });

  it("emits cascade-exhausted with openSlots on a mark-exhausted plan with open slots", () => {
    const match = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["Organiser"],
      invitedPlayers: [
        makeInvite({ playerRef: "+32490000001", status: "accepted" }),
      ],
    });
    const notices = decideRunnerNotices({ match, planKind: "mark-exhausted" });
    expect(notices).toEqual([{ kind: "cascade-exhausted", openSlots: 2 }]);
  });

  it("emits nothing on a mark-exhausted plan with no open slots (defensive)", () => {
    const full = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["Organiser", "A", "B", "C"],
    });
    const notices = decideRunnerNotices({
      match: full,
      planKind: "mark-exhausted",
    });
    expect(notices).toEqual([]);
  });

  it("emits nothing on idle or fire-phase plans", () => {
    const match = makeMatch();
    expect(decideRunnerNotices({ match, planKind: "idle" })).toEqual([]);
    expect(decideRunnerNotices({ match, planKind: "fire-phase" })).toEqual(
      [],
    );
  });
});
