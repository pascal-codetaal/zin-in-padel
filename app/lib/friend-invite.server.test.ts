import { describe, expect, it } from "vitest";
import {
  buildFriendInviteForwardText,
  buildFriendInviteWhatsAppUrl,
} from "./friend-invite-message.server";

describe("buildFriendInviteForwardText", () => {
  it("includes inviter name and bot link", () => {
    const text = buildFriendInviteForwardText({
      friendName: "Tom",
      inviterName: "Pascal",
      botOnboardingUrl: "https://wa.me/32470123456?text=JA",
    });
    expect(text).toContain("Hoi Tom!");
    expect(text).toContain("Pascal gebruikt Zin in Padel");
    expect(text).toContain("https://wa.me/32470123456?text=JA");
  });
});

describe("buildFriendInviteWhatsAppUrl", () => {
  it("targets the friend phone with encoded forward text", () => {
    const url = buildFriendInviteWhatsAppUrl("+32470987654", "Hoi Tom!");
    expect(url).toMatch(/^https:\/\/wa\.me\/32470987654\?text=/);
    expect(decodeURIComponent(url!.split("?text=")[1]!)).toBe("Hoi Tom!");
  });
});
