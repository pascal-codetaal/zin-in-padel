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

function parseSingleVcardBlock(block: string): ParsedVcardContact | null {
  let fn: string | null = null;
  let n: string | null = null;
  const phones: string[] = [];

  for (const line of unfoldVcardLines(block)) {
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

/** Split a .vcf payload into individual vCard blocks. */
export function splitVcardBlocks(raw: string): string[] {
  const blocks: string[] = [];
  const lines = raw.split(/\r?\n/);
  let current: string[] = [];

  for (const line of lines) {
    if (/^BEGIN:VCARD/i.test(line)) {
      if (current.length > 0) blocks.push(current.join("\n"));
      current = [line];
      continue;
    }
    if (current.length > 0) {
      current.push(line);
      if (/^END:VCARD/i.test(line)) {
        blocks.push(current.join("\n"));
        current = [];
      }
    }
  }

  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

/**
 * Parse one or more vCards (3.0 / 4.0 subset) from a .vcf payload.
 * WhatsApp may bundle multiple contacts in one file when sharing several at once.
 */
export function parseVcards(raw: string): ParsedVcardContact[] {
  const text = raw.trim();
  if (!/BEGIN:VCARD/i.test(text)) return [];

  const blocks = splitVcardBlocks(text);
  const parsed =
    blocks.length > 0
      ? blocks
          .map((block) => parseSingleVcardBlock(block))
          .filter((c): c is ParsedVcardContact => c !== null)
      : (() => {
          const single = parseSingleVcardBlock(text);
          return single ? [single] : [];
        })();

  return parsed;
}

/** Parse the first vCard in a payload (legacy helper). */
export function parseVcard(raw: string): ParsedVcardContact | null {
  return parseVcards(raw)[0] ?? null;
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
