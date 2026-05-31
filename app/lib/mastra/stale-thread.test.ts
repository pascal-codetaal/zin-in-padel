import { describe, expect, it } from "vitest";
import { isStaleOpenAiThreadError } from "./stale-thread.server";

describe("isStaleOpenAiThreadError", () => {
  it("detects OpenAI Responses item-not-found errors", () => {
    const error = new Error(
      "Item with id 'rs_0accd299c66da233006a17fc813ef0819ea9142368fd5edb0d' not found.",
    );
    expect(isStaleOpenAiThreadError(error)).toBe(true);
  });

  it("detects wrapped errors via cause chain", () => {
    const inner = new Error("Item with id 'rs_abc' not found.");
    const outer = new Error("Upstream LLM API error", { cause: inner });
    expect(isStaleOpenAiThreadError(outer)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isStaleOpenAiThreadError(new Error("User not found"))).toBe(false);
    expect(isStaleOpenAiThreadError(new Error("rate limit exceeded"))).toBe(
      false,
    );
  });
});
