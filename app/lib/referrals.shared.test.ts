import { describe, expect, it } from "vitest";
import {
  buildReferralBotMessage,
  normalizeReferralCode,
  parseReferralCodeFromMessage,
} from "~/lib/referrals.shared";

describe("normalizeReferralCode", () => {
  it("normalizes casing and separators", () => {
    expect(normalizeReferralCode("ab-12-cd")).toBe("AB12CD");
  });

  it("rejects short or malformed codes", () => {
    expect(normalizeReferralCode("abc")).toBeNull();
    expect(normalizeReferralCode("!!!")).toBeNull();
  });
});

describe("parseReferralCodeFromMessage", () => {
  it("parses the direct WhatsApp referral command", () => {
    expect(parseReferralCodeFromMessage("REF AB12CD34")).toBe("AB12CD34");
  });

  it("parses start-prefixed referral commands", () => {
    expect(parseReferralCodeFromMessage("START REF ab12cd34")).toBe("AB12CD34");
  });

  it("ignores messages without referral commands", () => {
    expect(parseReferralCodeFromMessage("JA")).toBeNull();
  });
});

describe("buildReferralBotMessage", () => {
  it("builds the bot command sent through wa.me", () => {
    expect(buildReferralBotMessage("AB12CD34")).toBe("REF AB12CD34");
  });
});
