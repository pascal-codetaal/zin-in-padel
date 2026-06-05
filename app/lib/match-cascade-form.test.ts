import { describe, expect, it } from "vitest";
import {
  inferInviteFriendsEnabled,
  parseCascadeFromForm,
} from "./match-cascade-form.server";

const organizer = {
  gender: "m" as const,
  level: 300 as const,
  matchLevelMin: 200 as const,
  matchLevelMax: 400 as const,
};

describe("inferInviteFriendsEnabled", () => {
  it("is true when friends are selected", () => {
    expect(
      inferInviteFriendsEnabled({
        invitedFriendRefs: ["+32470111111"],
        fallbackToLevelRange: false,
        fallbackLevelDelayMinutes: 30,
        fallbackToEveryone: false,
      }),
    ).toBe(true);
  });

  it("is false when friends off pattern (empty + immediate range)", () => {
    expect(
      inferInviteFriendsEnabled({
        invitedFriendRefs: [],
        fallbackToLevelRange: true,
        fallbackLevelDelayMinutes: 0,
        fallbackToEveryone: false,
      }),
    ).toBe(false);
  });
});

describe("parseCascadeFromForm", () => {
  it("forces level range immediately when friends disabled", () => {
    const form = new FormData();
    const flags = parseCascadeFromForm(form, organizer);
    expect(flags.inviteFriendsEnabled).toBe(false);
    expect(flags.fallbackToLevelRange).toBe(true);
    expect(flags.fallbackLevelDelayMinutes).toBe(0);
    expect(flags.fallbackToEveryone).toBe(false);
    expect(flags.fallbackLevelMin).toBe(200);
    expect(flags.fallbackLevelMax).toBe(400);
  });

  it("parses optional range when friends enabled", () => {
    const form = new FormData();
    form.set("inviteFriendsEnabled", "on");
    form.set("fallbackToLevelRange", "on");
    form.set("fallbackLevelMin", "200");
    form.set("fallbackLevelMax", "500");
    form.set("fallbackLevelDelayMinutes", "30");
    const flags = parseCascadeFromForm(form, organizer);
    expect(flags.inviteFriendsEnabled).toBe(true);
    expect(flags.fallbackToLevelRange).toBe(true);
    expect(flags.fallbackLevelDelayMinutes).toBe(30);
    expect(flags.fallbackToEveryone).toBe(false);
  });
});
