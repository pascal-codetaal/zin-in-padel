import { describe, expect, it } from "vitest";
import type { MatchPickerPlayer } from "~/lib/match-picker";
import {
  filterInvitableFriendRefs,
  findPlayerRefByFuzzyName,
  playerRefsOnCourtFromRoster,
  resolveMaatjesInvitedRefs,
} from "./match-roster.server";

const noInvite = { inviteUrl: null, inviteForwardText: null } as const;

const players: MatchPickerPlayer[] = [
  {
    ref: "+32470111111",
    name: "Arnaud Goossens",
    level: 300,
    isAppUser: true,
    ...noInvite,
  },
  {
    ref: "+32470222222",
    name: "Matthee Van",
    level: 200,
    isAppUser: true,
    ...noInvite,
  },
  {
    ref: "+32470333333",
    name: "Victor",
    level: 400,
    isAppUser: true,
    ...noInvite,
  },
  {
    ref: "+32470444444",
    name: "Piet Janssens",
    level: null,
    isAppUser: false,
    ...noInvite,
  },
];

describe("findPlayerRefByFuzzyName", () => {
  it("matches exact names", () => {
    expect(findPlayerRefByFuzzyName("Arnaud Goossens", players)).toBe(
      "+32470111111",
    );
  });

  it("matches single-token names", () => {
    expect(findPlayerRefByFuzzyName("Victor", players)).toBe("+32470333333");
  });
});

describe("playerRefsOnCourtFromRoster", () => {
  it("maps Playtomic ✅ names to friend refs", () => {
    const refs = playerRefsOnCourtFromRoster({
      organizerName: "Pascal",
      confirmedSlotNames: [
        "Pascal",
        "Arnaud Goossens",
        "Matthee Van",
        "Victor",
      ],
      players,
    });
    expect(refs.has("+32470111111")).toBe(true);
    expect(refs.has("+32470222222")).toBe(true);
    expect(refs.has("+32470333333")).toBe(true);
    expect(refs.size).toBe(3);
  });
});

describe("filterInvitableFriendRefs", () => {
  it("removes on-court refs from invite list", () => {
    const onCourt = new Set(["+32470111111", "+32470222222"]);
    const invited = filterInvitableFriendRefs(
      players.map((p) => p.ref),
      onCourt,
    );
    expect(invited).toEqual(["+32470333333", "+32470444444"]);
  });
});

describe("resolveMaatjesInvitedRefs", () => {
  const onCourt = ["+32470111111"];

  it("defaults to app-user maatjes not on court when nothing saved", () => {
    expect(resolveMaatjesInvitedRefs(players, onCourt, [])).toEqual([
      "+32470222222",
      "+32470333333",
    ]);
  });

  it("defaults to all when saved list already covers everyone invitable", () => {
    expect(
      resolveMaatjesInvitedRefs(players, onCourt, [
        "+32470222222",
        "+32470333333",
        "+32470444444",
      ]),
    ).toEqual(["+32470222222", "+32470333333"]);
  });

  it("drops non-app-user refs from a saved selection", () => {
    expect(
      resolveMaatjesInvitedRefs(players, onCourt, ["+32470444444"]),
    ).toEqual(["+32470222222", "+32470333333"]);
  });

  it("keeps a partial saved selection", () => {
    expect(
      resolveMaatjesInvitedRefs(players, onCourt, ["+32470333333"]),
    ).toEqual(["+32470333333"]);
  });
});
