import { describe, expect, it } from "vitest";
import { decideMatchOpenability } from "./open-match";
import { makeMatch } from "./test-fixtures";

describe("decideMatchOpenability", () => {
  it("opens a draft with a schedule and a club", () => {
    const match = makeMatch({ status: "draft" });
    expect(decideMatchOpenability(match)).toEqual({ kind: "openable" });
  });

  it("rejects a draft without a scheduled time", () => {
    const match = makeMatch({ status: "draft", scheduledAt: null });
    expect(decideMatchOpenability(match)).toEqual({
      kind: "not-openable",
      reason: "missing-schedule",
    });
  });

  it("rejects a draft without a club", () => {
    const match = makeMatch({ status: "draft", clubIds: [] });
    expect(decideMatchOpenability(match)).toEqual({
      kind: "not-openable",
      reason: "missing-club",
    });
  });

  it("reports missing-schedule before missing-club", () => {
    const match = makeMatch({
      status: "draft",
      scheduledAt: null,
      clubIds: [],
    });
    expect(decideMatchOpenability(match)).toEqual({
      kind: "not-openable",
      reason: "missing-schedule",
    });
  });

  it.each(["open", "confirmed", "full"] as const)(
    "treats a %s match as already live",
    (status) => {
      const match = makeMatch({ status });
      expect(decideMatchOpenability(match)).toEqual({ kind: "already-open" });
    },
  );

  it("never opens a cancelled match", () => {
    const match = makeMatch({ status: "cancelled" });
    expect(decideMatchOpenability(match)).toEqual({
      kind: "not-openable",
      reason: "cancelled",
    });
  });

  it("reports cancelled even when fields are also missing", () => {
    const match = makeMatch({ status: "cancelled", scheduledAt: null });
    expect(decideMatchOpenability(match)).toEqual({
      kind: "not-openable",
      reason: "cancelled",
    });
  });
});
