import { describe, expect, it } from "vitest";
import {
  createInviteToken,
  INVITE_TOKEN_ALPHABET,
  INVITE_TOKEN_LENGTH,
  isValidInviteTokenShape,
} from "./token";

describe("createInviteToken", () => {
  it("returns a 22-character string", () => {
    const tok = createInviteToken();
    expect(tok).toHaveLength(INVITE_TOKEN_LENGTH);
  });

  it("uses only base62 characters", () => {
    const tok = createInviteToken();
    for (const ch of tok) {
      expect(INVITE_TOKEN_ALPHABET).toContain(ch);
    }
  });

  it("produces unique tokens at scale (1000 distinct)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(createInviteToken());
    expect(seen.size).toBe(1000);
  });

  it("distributes across the alphabet (sanity, not crypto-grade)", () => {
    // Generate 100 tokens worth of chars (~2200 chars). Expect at least
    // 40 of the 62 alphabet symbols to appear — catches accidental
    // distribution collapse (e.g. only digits).
    const histogram = new Set<string>();
    for (let i = 0; i < 100; i++) {
      for (const ch of createInviteToken()) histogram.add(ch);
    }
    expect(histogram.size).toBeGreaterThanOrEqual(40);
  });
});

describe("isValidInviteTokenShape", () => {
  it("accepts a freshly-generated token", () => {
    expect(isValidInviteTokenShape(createInviteToken())).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidInviteTokenShape("")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(isValidInviteTokenShape("abc")).toBe(false);
    expect(isValidInviteTokenShape("a".repeat(21))).toBe(false);
    expect(isValidInviteTokenShape("a".repeat(23))).toBe(false);
  });

  it("rejects characters outside the alphabet", () => {
    expect(isValidInviteTokenShape("-".repeat(22))).toBe(false);
    expect(isValidInviteTokenShape("a".repeat(21) + "/")).toBe(false);
  });
});
