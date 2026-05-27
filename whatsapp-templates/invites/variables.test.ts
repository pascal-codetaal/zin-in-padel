import { describe, expect, it } from "vitest";
import { buildInviteContentVariables } from "./variables";

const baseMatch = {
  clubName: "Padel Vlaanderen Brussel",
  whenLabel: "vrijdag 5 juni — 19:00",
  openSlots: 2,
  format: "mixed" as const,
  fallbackLevelMin: 200 as const,
  fallbackLevelMax: 500 as const,
};

describe("buildInviteContentVariables", () => {
  it("phase 1 maps seven variables for CTA template", () => {
    expect(
      buildInviteContentVariables({
        phase: 1,
        match: baseMatch,
        recipient: { firstName: "Tom" },
        organiser: { fullName: "Jan Janssens" },
        acceptUrl: "https://zip.app/i/AAA",
        declineUrl: "https://zip.app/i/AAA/nee",
      }),
    ).toEqual({
      "1": "Tom",
      "2": "Jan Janssens",
      "3": "Padel Vlaanderen Brussel",
      "4": "vrijdag 5 juni — 19:00",
      "5": "Nog 2 plekken vrij",
      "6": "AAA",
      "7": "AAA/nee",
    });
  });

  it("phase 2 returns null when level range is missing (use plain-text fallback)", () => {
    expect(
      buildInviteContentVariables({
        phase: 2,
        match: { ...baseMatch, fallbackLevelMin: null, fallbackLevelMax: null },
        recipient: { firstName: "Tom" },
        organiser: { fullName: "Jan Janssens" },
        acceptUrl: "https://zip.app/i/AAA",
        declineUrl: "https://zip.app/i/AAA/nee",
      }),
    ).toBeNull();
  });

  it("phase 3 maps six variables", () => {
    expect(
      buildInviteContentVariables({
        phase: 3,
        match: baseMatch,
        recipient: { firstName: "Tom" },
        organiser: { fullName: "Jan Janssens" },
        acceptUrl: "https://zip.app/i/AAA",
        declineUrl: "https://zip.app/i/AAA/nee",
      }),
    ).toEqual({
      "1": "Jan Janssens",
      "2": "Padel Vlaanderen Brussel",
      "3": "vrijdag 5 juni — 19:00",
      "4": "Nog 2 plekken vrij",
      "5": "AAA",
      "6": "AAA/nee",
    });
  });
});
