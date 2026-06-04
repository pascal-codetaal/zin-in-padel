import { describe, expect, it } from "vitest";
import { makeUser } from "~/lib/cascade/test-fixtures";
import { canonicalRefName, displayFriendName } from "~/lib/friend-name.server";

const PASCAL_REF = "+32484085782";

// A registered owner of PASCAL_REF whose real name is "Pascal Van Hecke".
const pascal = makeUser({
  id: "u_pascal",
  phone: "whatsapp:+32484085782",
  waId: "+32484085782",
  firstName: "Pascal",
  lastName: "Van Hecke",
  profileName: "Pascal",
});

// The shared Player stub holds a stale label a friend-adder once typed.
const stub = { name: "Paskwal Van Hecke", phone: PASCAL_REF };

describe("canonicalRefName", () => {
  it("prefers a registered owner's real name over the stale Player stub", () => {
    expect(canonicalRefName(PASCAL_REF, stub, [pascal], "Onbekend")).toBe(
      "Pascal Van Hecke",
    );
  });

  it("falls back to the Player stub when no registered owner matches", () => {
    expect(canonicalRefName(PASCAL_REF, stub, [], "Onbekend")).toBe(
      "Paskwal Van Hecke",
    );
  });

  it("uses the fallback when neither owner nor stub exists", () => {
    expect(canonicalRefName(PASCAL_REF, undefined, [], "Onbekend")).toBe(
      "Onbekend",
    );
  });

  it("uses the owner's profileName when structured names are missing", () => {
    const owner = makeUser({
      phone: "whatsapp:+32484085782",
      waId: "+32484085782",
      firstName: null,
      lastName: null,
      profileName: "Pas",
    });
    expect(canonicalRefName(PASCAL_REF, stub, [owner], "Onbekend")).toBe("Pas");
  });
});

describe("displayFriendName", () => {
  it("lets the viewer's own nickname win over everything", () => {
    expect(
      displayFriendName({ [PASCAL_REF]: "Paske" }, PASCAL_REF, stub, [pascal], "Onbekend"),
    ).toBe("Paske");
  });

  it("without a nickname, shows the registered owner's real name (not the stub)", () => {
    expect(
      displayFriendName({}, PASCAL_REF, stub, [pascal], "Onbekend"),
    ).toBe("Pascal Van Hecke");
  });

  it("without a nickname or owner, shows the Player stub", () => {
    expect(displayFriendName({}, PASCAL_REF, stub, [], "Onbekend")).toBe(
      "Paskwal Van Hecke",
    );
  });

  it("falls back when nothing is known", () => {
    expect(
      displayFriendName({}, PASCAL_REF, undefined, [], "Onbekende speler"),
    ).toBe("Onbekende speler");
  });
});
