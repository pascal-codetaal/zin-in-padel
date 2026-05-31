import { describe, expect, it, vi } from "vitest";
import { parseWaitlistForm } from "~/lib/waitlist-form.server";

vi.mock("~/lib/padelstats-catalog.server", () => ({
  findPadelstatsMemberById: vi.fn(async (id: number) =>
    id === 36015
      ? {
          id: 36015,
          name: "Boucique Gunter",
          gender: "M",
          currentRank: 200,
          clubId: "2032",
          clubName: "A.T.C.ANZEGEM",
          label: "Boucique Gunter · P200 · A.T.C.ANZEGEM",
        }
      : null,
  ),
}));

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

describe("parseWaitlistForm", () => {
  it("accepts phone + padelstats member", async () => {
    const result = await parseWaitlistForm(
      form({
        phone: "0470 12 34 56",
        tvMemberId: "36015",
        clubId: "2032",
        consent: "on",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.phone).toBe("+32470123456");
    expect(result.data.tvMemberId).toBe(36015);
    expect(result.data.clubId).toBe("2032");
  });

  it("rejects missing member", async () => {
    const result = await parseWaitlistForm(
      form({ phone: "0470123456", consent: "on" }),
    );
    expect(result).toEqual({ ok: false, error: "member_required" });
  });
});
