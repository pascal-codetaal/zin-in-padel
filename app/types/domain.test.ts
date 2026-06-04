import { describe, expect, it } from "vitest";
import { makeInvite, makeMatch } from "~/lib/cascade/test-fixtures";
import {
  acceptedPlayerRefsOf,
  isMatchFull,
  openSlotsOf,
  resolveFavoriteName,
} from "./domain";

describe("acceptedPlayerRefsOf", () => {
  it("returns only player refs whose invite status is 'accepted'", () => {
    const match = makeMatch({
      invitedPlayers: [
        makeInvite({ playerRef: "p_accepted", status: "accepted" }),
        makeInvite({ playerRef: "p_pending", status: "pending" }),
        makeInvite({ playerRef: "p_declined", status: "declined" }),
        makeInvite({ playerRef: "p_expired", status: "expired" }),
      ],
    });
    expect(acceptedPlayerRefsOf(match)).toEqual(["p_accepted"]);
  });

  it("returns an empty array when no invites have been accepted", () => {
    const match = makeMatch({
      invitedPlayers: [
        makeInvite({ playerRef: "p1", status: "pending" }),
        makeInvite({ playerRef: "p2", status: "declined" }),
      ],
    });
    expect(acceptedPlayerRefsOf(match)).toEqual([]);
  });

  it("returns an empty array when invitedPlayers is empty", () => {
    expect(acceptedPlayerRefsOf(makeMatch({ invitedPlayers: [] }))).toEqual([]);
  });
});

describe("openSlotsOf", () => {
  it("subtracts confirmedSlotNames and accepted invites from totalSlots", () => {
    const match = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["Organiser"],
      invitedPlayers: [
        makeInvite({ playerRef: "p1", status: "accepted" }),
        makeInvite({ playerRef: "p2", status: "accepted" }),
      ],
    });
    expect(openSlotsOf(match)).toBe(1);
  });

  it("does not subtract pending or declined invites", () => {
    const match = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["Organiser"],
      invitedPlayers: [
        makeInvite({ playerRef: "p1", status: "pending" }),
        makeInvite({ playerRef: "p2", status: "declined" }),
      ],
    });
    expect(openSlotsOf(match)).toBe(3);
  });

  it("clamps at zero when the court is overcommitted", () => {
    // Defensive: if confirmed + accepted ever exceeds totalSlots (e.g. an
    // organiser-removal race), the helper must not report negative slots.
    const match = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["A", "B", "C", "D", "E"],
    });
    expect(openSlotsOf(match)).toBe(0);
  });

  it("returns totalSlots when no slots are filled", () => {
    expect(
      openSlotsOf(makeMatch({ totalSlots: 4, confirmedSlotNames: [] })),
    ).toBe(4);
  });
});

describe("isMatchFull", () => {
  it("is true exactly when openSlots reaches zero", () => {
    const match = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["A"],
      invitedPlayers: [
        makeInvite({ playerRef: "p1", status: "accepted" }),
        makeInvite({ playerRef: "p2", status: "accepted" }),
        makeInvite({ playerRef: "p3", status: "accepted" }),
      ],
    });
    expect(isMatchFull(match)).toBe(true);
  });

  it("is false while at least one slot remains open", () => {
    const match = makeMatch({
      totalSlots: 4,
      confirmedSlotNames: ["A"],
      invitedPlayers: [makeInvite({ playerRef: "p1", status: "accepted" })],
    });
    expect(isMatchFull(match)).toBe(false);
  });
});

describe("resolveFavoriteName", () => {
  const ref = "+32470123456";

  it("prefers the viewer's own nickname over the canonical Player name", () => {
    expect(
      resolveFavoriteName({ [ref]: "Bobke" }, ref, "Robert Smith", "fallback"),
    ).toBe("Bobke");
  });

  it("falls back to the canonical Player name when no nickname is set", () => {
    expect(resolveFavoriteName({}, ref, "Robert Smith", "fallback")).toBe(
      "Robert Smith",
    );
  });

  it("uses the fallback when neither nickname nor Player name is available", () => {
    expect(resolveFavoriteName({}, ref, null, "Onbekende speler")).toBe(
      "Onbekende speler",
    );
    expect(resolveFavoriteName({}, ref, undefined, "Onbekende speler")).toBe(
      "Onbekende speler",
    );
  });

  it("treats an empty Player name as absent and uses the fallback", () => {
    expect(resolveFavoriteName({}, ref, "", "Onbekende speler")).toBe(
      "Onbekende speler",
    );
  });

  it("only applies a nickname to its own ref", () => {
    const names = { [ref]: "Bobke" };
    expect(resolveFavoriteName(names, "+32499999999", "Other", "fallback")).toBe(
      "Other",
    );
  });
});
