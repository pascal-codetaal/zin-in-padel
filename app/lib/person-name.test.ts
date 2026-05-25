import { describe, expect, it } from "vitest";
import {
  formatPersonName,
  parsePersonName,
  resolveUserNameParts,
  syncProfileNameFromParts,
} from "./person-name";

describe("parsePersonName", () => {
  it("splits voornaam and familienaam", () => {
    expect(parsePersonName("Pascal Van Hecke")).toEqual({
      firstName: "Pascal",
      lastName: "Van Hecke",
    });
  });

  it("returns only firstName when single token", () => {
    expect(parsePersonName("Pascal")).toEqual({
      firstName: "Pascal",
      lastName: null,
    });
  });
});

describe("formatPersonName", () => {
  it("prefers structured first and last name", () => {
    expect(
      formatPersonName({
        firstName: "Jan",
        lastName: "Janssens",
        profileName: "ignored",
      }),
    ).toBe("Jan Janssens");
  });

  it("falls back to profileName", () => {
    expect(formatPersonName({ profileName: "WhatsApp Only" })).toBe(
      "WhatsApp Only",
    );
  });
});

describe("syncProfileNameFromParts", () => {
  it("builds full name for profileName field", () => {
    expect(
      syncProfileNameFromParts({ firstName: "Jan", lastName: "Janssens" }),
    ).toBe("Jan Janssens");
  });
});

describe("resolveUserNameParts", () => {
  it("resolves from profileName when structured fields empty", () => {
    expect(
      resolveUserNameParts({
        firstName: null,
        lastName: null,
        profileName: "Pascal Van Hecke",
      }),
    ).toEqual({ firstName: "Pascal", lastName: "Van Hecke" });
  });
});
