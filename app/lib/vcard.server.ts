import { parsePhoneFromText } from "~/lib/phone.server";

export type ParsedVcardContact = {
  name: string;
  phones: string[];
};

/** Unfold vCard lines (RFC 2426 continuation lines start with space/tab). */
function unfoldVcardLines(raw: string): string[] {
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeVcardValue(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseVcardProperty(line: string): { key: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const keyPart = line.slice(0, colon);
  const value = unescapeVcardValue(line.slice(colon + 1).trim());
  const key = keyPart.split(";")[0]?.toUpperCase() ?? "";
  if (!key) return null;
  return { key, value };
}

function nameFromNField(value: string): string | null {
  const parts = value.split(";").map((p) => p.trim());
  const family = parts[0] ?? "";
  const given = parts[1] ?? "";
  const combined = [given, family].filter(Boolean).join(" ").trim();
  return combined || null;
}

/**
 * Parse a vCard (3.0 / 4.0 subset) into display name and normalized phone numbers.
 */
export function parseVcard(raw: string): ParsedVcardContact | null {
  const text = raw.trim();
  if (!/BEGIN:VCARD/i.test(text)) return null;

  let fn: string | null = null;
  let n: string | null = null;
  const phones: string[] = [];

  for (const line of unfoldVcardLines(text)) {
    const prop = parseVcardProperty(line.trim());
    if (!prop) continue;

    switch (prop.key) {
      case "FN":
        if (prop.value) fn = prop.value;
        break;
      case "N":
        if (prop.value) n = nameFromNField(prop.value);
        break;
      case "TEL": {
        const normalized = parsePhoneFromText(prop.value);
        if (normalized && !phones.includes(normalized)) {
          phones.push(normalized);
        }
        break;
      }
      default:
        break;
    }
  }

  const name = (fn ?? n ?? "").trim();
  if (!name && phones.length === 0) return null;

  return {
    name: name || "Contact",
    phones,
  };
}

/** First mobile-like number from a parsed vCard. */
export function primaryPhoneFromVcard(
  contact: ParsedVcardContact,
): string | null {
  for (const raw of contact.phones) {
    const phone = parsePhoneFromText(raw);
    if (phone) return phone;
  }
  return null;
}
