import { describe, expect, it } from "vitest";
import {
  buildPhaseAudience,
  excludeReason,
  type AudienceIndex,
} from "./audience";
import { makeMatch, makeUser } from "./test-fixtures";

const emptyIndex: AudienceIndex = {
  alreadyInvitedRefs: new Set(),
  declinedRefs: new Set(),
  friendRefs: new Set(),
  conflictingRefs: new Set(),
};

describe("excludeReason — universal (all phases)", () => {
  it("excludes the organiser", () => {
    const match = makeMatch({ organizerId: "user_organizer" });
    const user = makeUser({ id: "user_organizer" });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBe(
      "organiser",
    );
  });

  it("excludes opted-out users", () => {
    const match = makeMatch();
    const user = makeUser({ optedIn: false });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBe(
      "opted-out",
    );
  });

  it("excludes already-invited refs", () => {
    const match = makeMatch();
    const user = makeUser();
    expect(
      excludeReason(match, 2, user, "+32470000001", {
        ...emptyIndex,
        alreadyInvitedRefs: new Set(["+32470000001"]),
      }),
    ).toBe("already-invited");
  });

  it("excludes refs that declined previously", () => {
    const match = makeMatch();
    const user = makeUser();
    expect(
      excludeReason(match, 3, user, "+32470000001", {
        ...emptyIndex,
        declinedRefs: new Set(["+32470000001"]),
      }),
    ).toBe("declined-previously");
  });
});

describe("excludeReason — phase 1 (friends)", () => {
  it("requires the ref to be on the organiser's friend list", () => {
    const match = makeMatch();
    const user = makeUser();
    expect(excludeReason(match, 1, user, "+32470000001", emptyIndex)).toBe(
      "not-on-friend-list",
    );
  });

  it("accepts a friend who is opted in", () => {
    const match = makeMatch();
    const user = makeUser();
    expect(
      excludeReason(match, 1, user, "+32470000001", {
        ...emptyIndex,
        friendRefs: new Set(["+32470000001"]),
      }),
    ).toBeNull();
  });

  it("does not apply phase-2 filters to phase 1 friends", () => {
    // A friend with friends_only preference, wrong gender for the format,
    // out-of-range level, and time conflict still gets phase-1 invited.
    const match = makeMatch({
      format: "men_only",
      fallbackLevelMin: 200,
      fallbackLevelMax: 300,
    });
    const user = makeUser({
      gender: "w",
      level: 1000,
      matchPreference: "friends_only",
      preferredClubIds: [],
    });
    expect(
      excludeReason(match, 1, user, "+32470000001", {
        ...emptyIndex,
        friendRefs: new Set(["+32470000001"]),
        conflictingRefs: new Set(["+32470000001"]),
      }),
    ).toBeNull();
  });
});

describe("excludeReason — phase 2 (level)", () => {
  it("excludes friends_only preference", () => {
    const match = makeMatch({
      fallbackToLevelRange: true,
      fallbackLevelMin: 200,
      fallbackLevelMax: 500,
    });
    const user = makeUser({ matchPreference: "friends_only" });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBe(
      "friends-only-preference",
    );
  });

  it("excludes wrong gender for men_only", () => {
    const match = makeMatch({
      format: "men_only",
      fallbackLevelMin: 200,
      fallbackLevelMax: 500,
    });
    const user = makeUser({ gender: "w" });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBe(
      "gender-mismatch",
    );
  });

  it("includes both genders for mixed", () => {
    const match = makeMatch({
      format: "mixed",
      fallbackLevelMin: 200,
      fallbackLevelMax: 500,
    });
    expect(
      excludeReason(match, 2, makeUser({ gender: "w", level: 300 }), "x", emptyIndex),
    ).toBeNull();
    expect(
      excludeReason(match, 2, makeUser({ gender: "m", level: 300 }), "x", emptyIndex),
    ).toBeNull();
  });

  it("excludes refs whose preferredClubIds doesn't include the match club", () => {
    const match = makeMatch({
      clubId: "club_42",
      clubIds: ["club_42"],
      fallbackLevelMin: 200,
      fallbackLevelMax: 500,
    });
    const user = makeUser({ preferredClubIds: ["club_1"] });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBe(
      "club-not-preferred",
    );
  });

  it("accepts refs who prefer any of the match locations", () => {
    const match = makeMatch({
      clubId: "club_1",
      clubIds: ["club_1", "club_42"],
      fallbackLevelMin: 200,
      fallbackLevelMax: 500,
    });
    const user = makeUser({ preferredClubIds: ["club_42"] });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBeNull();
  });

  it("excludes refs with a time conflict", () => {
    const match = makeMatch({
      fallbackLevelMin: 200,
      fallbackLevelMax: 500,
    });
    const user = makeUser();
    expect(
      excludeReason(match, 2, user, "+32470000001", {
        ...emptyIndex,
        conflictingRefs: new Set(["+32470000001"]),
      }),
    ).toBe("time-conflict");
  });

  it("excludes level below the range", () => {
    const match = makeMatch({
      fallbackLevelMin: 300,
      fallbackLevelMax: 500,
    });
    const user = makeUser({ level: 200 });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBe(
      "level-out-of-range",
    );
  });

  it("excludes level above the range", () => {
    const match = makeMatch({
      fallbackLevelMin: 200,
      fallbackLevelMax: 400,
    });
    const user = makeUser({ level: 500 });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBe(
      "level-out-of-range",
    );
  });

  it("excludes null level (invariant violation defensively rejected)", () => {
    const match = makeMatch({
      fallbackLevelMin: 200,
      fallbackLevelMax: 500,
    });
    const user = makeUser({ level: null });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBe(
      "level-out-of-range",
    );
  });

  it("accepts a candidate that meets all phase-2 conditions", () => {
    const match = makeMatch({
      clubId: "club_1",
      fallbackLevelMin: 200,
      fallbackLevelMax: 500,
    });
    const user = makeUser({
      level: 300,
      gender: "m",
      preferredClubIds: ["club_1"],
      matchPreference: "open",
    });
    expect(excludeReason(match, 2, user, "+32470000001", emptyIndex)).toBeNull();
  });
});

describe("excludeReason — phase 3 (everyone)", () => {
  it("does NOT apply the level filter", () => {
    const match = makeMatch({
      fallbackLevelMin: 200,
      fallbackLevelMax: 300,
    });
    const user = makeUser({ level: 1000 });
    expect(excludeReason(match, 3, user, "+32470000001", emptyIndex)).toBeNull();
  });

  it("still applies club preference", () => {
    const match = makeMatch({ clubId: "club_42" });
    const user = makeUser({ preferredClubIds: ["club_1"] });
    expect(excludeReason(match, 3, user, "+32470000001", emptyIndex)).toBe(
      "club-not-preferred",
    );
  });

  it("still applies time conflict", () => {
    const match = makeMatch();
    const user = makeUser();
    expect(
      excludeReason(match, 3, user, "+32470000001", {
        ...emptyIndex,
        conflictingRefs: new Set(["+32470000001"]),
      }),
    ).toBe("time-conflict");
  });
});

describe("buildPhaseAudience", () => {
  it("partitions candidates into accepted + rejected with reasons", () => {
    const match = makeMatch({
      organizerId: "user_organizer",
      clubId: "club_1",
      fallbackLevelMin: 200,
      fallbackLevelMax: 500,
    });
    const organiser = makeUser({ id: "user_organizer" });
    const goodCandidate = makeUser({
      id: "user_good",
      level: 300,
      preferredClubIds: ["club_1"],
    });
    const wrongClub = makeUser({
      id: "user_wrongclub",
      level: 300,
      preferredClubIds: ["club_99"],
    });

    const result = buildPhaseAudience(
      match,
      2,
      [
        { user: organiser, ref: "+ORG" },
        { user: goodCandidate, ref: "+32470000002" },
        { user: wrongClub, ref: "+32470000003" },
      ],
      emptyIndex,
    );

    expect(result.accepted.map((u) => u.id)).toEqual(["user_good"]);
    expect(
      result.rejected.map((r) => ({ id: r.user.id, reason: r.reason })),
    ).toEqual([
      { id: "user_organizer", reason: "organiser" },
      { id: "user_wrongclub", reason: "club-not-preferred" },
    ]);
  });
});
