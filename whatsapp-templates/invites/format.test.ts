import { describe, expect, it } from "vitest";
import {
  formatInviteMessage,
  type InviteMatchView,
  type InviteOrganiser,
  type InviteRecipient,
} from "./format";

const baseMatch: InviteMatchView = {
  clubName: "Padel Vlaanderen Brussel",
  whenLabel: "vrijdag 5 juni — 19:00",
  openSlots: 2,
  format: "mixed",
  fallbackLevelMin: 200,
  fallbackLevelMax: 500,
};

const organiser: InviteOrganiser = { fullName: "Jan Janssens" };
const recipient: InviteRecipient = { firstName: "Tom" };

const URLS = {
  acceptUrl: "https://zip.app/i/AAA111BBB222CCC333DDD4",
  declineUrl: "https://zip.app/i/AAA111BBB222CCC333DDD4/nee",
};

describe("formatInviteMessage", () => {
  it("phase 1 (Friends) — personalised greeting with organiser full name", () => {
    expect(
      formatInviteMessage({
        phase: 1,
        match: baseMatch,
        recipient,
        organiser,
        ...URLS,
      }),
    ).toMatchInlineSnapshot(`
      "Hey Tom! Jan Janssens nodigt je uit voor een padelmatch.

      📍 Padel Vlaanderen Brussel
      📅 vrijdag 5 juni — 19:00
      👥 Nog 2 plekken vrij

      ✅ Ja, ik doe mee: https://zip.app/i/AAA111BBB222CCC333DDD4
      ❌ Nee, andere keer: https://zip.app/i/AAA111BBB222CCC333DDD4/nee

      Stuur STOP om geen uitnodigingen meer te ontvangen."
    `);
  });

  it("phase 2 (Level) — level-range line included, no first-name greeting", () => {
    expect(
      formatInviteMessage({
        phase: 2,
        match: baseMatch,
        recipient,
        organiser,
        ...URLS,
      }),
    ).toMatchInlineSnapshot(`
      "Padelmatch: Jan Janssens zoekt nog spelers op jouw niveau in Padel Vlaanderen Brussel.

      📍 Padel Vlaanderen Brussel
      📅 vrijdag 5 juni — 19:00
      👥 Nog 2 plekken vrij
      🎯 Niveau P200 — P500

      ✅ Ja, ik doe mee: https://zip.app/i/AAA111BBB222CCC333DDD4
      ❌ Nee, andere keer: https://zip.app/i/AAA111BBB222CCC333DDD4/nee

      Stuur STOP om geen uitnodigingen meer te ontvangen."
    `);
  });

  it("phase 3 (Everyone) — open call, no level line", () => {
    expect(
      formatInviteMessage({
        phase: 3,
        match: baseMatch,
        recipient,
        organiser,
        ...URLS,
      }),
    ).toMatchInlineSnapshot(`
      "Padelmatch: Jan Janssens zoekt nog spelers in Padel Vlaanderen Brussel. Zin om mee te doen?

      📍 Padel Vlaanderen Brussel
      📅 vrijdag 5 juni — 19:00
      👥 Nog 2 plekken vrij

      ✅ Ja, ik doe mee: https://zip.app/i/AAA111BBB222CCC333DDD4
      ❌ Nee, andere keer: https://zip.app/i/AAA111BBB222CCC333DDD4/nee

      Stuur STOP om geen uitnodigingen meer te ontvangen."
    `);
  });

  it("uses singular 'plek' when only 1 slot is open", () => {
    const msg = formatInviteMessage({
      phase: 1,
      match: { ...baseMatch, openSlots: 1 },
      recipient,
      organiser,
      ...URLS,
    });
    expect(msg).toContain("Nog 1 plek vrij");
  });

  it("phase 2 collapses identical min/max to a single level label", () => {
    const msg = formatInviteMessage({
      phase: 2,
      match: { ...baseMatch, fallbackLevelMin: 300, fallbackLevelMax: 300 },
      recipient,
      organiser,
      ...URLS,
    });
    expect(msg).toContain("🎯 Niveau P300");
    expect(msg).not.toContain("P300 —");
  });

  it("phase 2 omits the level line if min/max are null (defensive)", () => {
    const msg = formatInviteMessage({
      phase: 2,
      match: { ...baseMatch, fallbackLevelMin: null, fallbackLevelMax: null },
      recipient,
      organiser,
      ...URLS,
    });
    expect(msg).not.toContain("🎯");
  });
});
