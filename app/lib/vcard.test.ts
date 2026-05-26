import { describe, expect, it } from "vitest";
import { parseVcard, parseVcards, primaryPhoneFromVcard } from "./vcard.server";

const SAMPLE_VCARD = `BEGIN:VCARD
VERSION:3.0
N:Janssen;Jan;;;
FN:Jan Janssen
TEL;TYPE=CELL:+32470123456
END:VCARD`;

describe("parseVcard", () => {
  it("extracts FN and TEL", () => {
    const parsed = parseVcard(SAMPLE_VCARD);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe("Jan Janssen");
    expect(parsed!.phones).toContain("+32470123456");
    expect(primaryPhoneFromVcard(parsed!)).toBe("+32470123456");
  });

  it("uses N when FN is missing", () => {
    const parsed = parseVcard(`BEGIN:VCARD
VERSION:3.0
N:Peeters;Sara;;;
TEL:0470123456
END:VCARD`);
    expect(parsed?.name).toBe("Sara Peeters");
    expect(primaryPhoneFromVcard(parsed!)).toBe("+32470123456");
  });

  it("unfolds continued lines", () => {
    const parsed = parseVcard(`BEGIN:VCARD
VERSION:3.0
FN:Long
 Name
TEL:+32470111222
END:VCARD`);
    expect(parsed?.name).toBe("LongName");
  });

  it("returns null for non-vCard text", () => {
    expect(parseVcard("hello")).toBeNull();
  });

  it("parses multiple vCards in one file", () => {
    const parsed = parseVcards(`BEGIN:VCARD
VERSION:3.0
FN:Alice
TEL:+32470111111
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Bob
TEL:+32470222222
END:VCARD`);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.name).toBe("Alice");
    expect(primaryPhoneFromVcard(parsed[0]!)).toBe("+32470111111");
    expect(parsed[1]?.name).toBe("Bob");
    expect(primaryPhoneFromVcard(parsed[1]!)).toBe("+32470222222");
  });
});
