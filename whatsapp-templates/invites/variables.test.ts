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
  it("maps seven variables for the invite CTA template", () => {
    expect(
      buildInviteContentVariables({
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
});
