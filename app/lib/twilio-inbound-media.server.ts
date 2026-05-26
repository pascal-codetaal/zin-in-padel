import { isTwilioMock } from "~/lib/twilio-config.server";
import { logTwilio, logTwilioWarn } from "~/lib/twilio-log.server";
import type { TwilioInboundMessage } from "~/lib/twilio.server";
import {
  parseVcard,
  primaryPhoneFromVcard,
  type ParsedVcardContact,
} from "~/lib/vcard.server";

export type TwilioInboundMedia = {
  url: string;
  contentType: string;
};

export type SharedContact = {
  name: string;
  phone: string;
};

export function parseTwilioInboundMedia(
  params: Record<string, string>,
): TwilioInboundMedia[] {
  const numMedia = Number.parseInt(params.NumMedia ?? "0", 10);
  if (!Number.isFinite(numMedia) || numMedia <= 0) return [];

  const media: TwilioInboundMedia[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`]?.trim();
    const contentType = params[`MediaContentType${i}`]?.trim() ?? "";
    if (url) media.push({ url, contentType });
  }
  return media;
}

export function isVcardContentType(contentType: string): boolean {
  const type = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return (
    type === "text/vcard" ||
    type === "text/x-vcard" ||
    type === "application/vcard"
  );
}

async function fetchTwilioMedia(url: string): Promise<string> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured (TWILIO_* env vars).");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Twilio media download failed (${response.status})`);
  }

  return response.text();
}

function toSharedContact(parsed: ParsedVcardContact): SharedContact | null {
  const phone = primaryPhoneFromVcard(parsed);
  if (!phone) return null;
  return { name: parsed.name, phone };
}

/**
 * Download and parse the first vCard attachment on an inbound WhatsApp message.
 */
export async function resolveSharedContactFromMedia(
  media: TwilioInboundMedia[],
): Promise<SharedContact | null> {
  for (const item of media) {
    if (!isVcardContentType(item.contentType)) continue;

    if (isTwilioMock()) {
      logTwilio("shared contact (mock)", { contentType: item.contentType });
      return null;
    }

    try {
      const raw = await fetchTwilioMedia(item.url);
      const parsed = parseVcard(raw);
      if (!parsed) {
        logTwilioWarn("vCard parse returned no contact", {
          contentType: item.contentType,
        });
        continue;
      }
      const contact = toSharedContact(parsed);
      if (contact) {
        logTwilio("shared contact parsed", {
          name: contact.name,
          phone: contact.phone,
        });
        return contact;
      }
      logTwilioWarn("vCard had no valid phone", { name: parsed.name });
    } catch (error) {
      logTwilioWarn("vCard download/parse failed", {
        contentType: item.contentType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

export function inboundHasVcardMedia(media: TwilioInboundMedia[]): boolean {
  return media.some((m) => isVcardContentType(m.contentType));
}

/**
 * Attach parsed WhatsApp shared contact to the inbound message (if any).
 */
export async function enrichInboundWithSharedContact(
  inbound: TwilioInboundMessage,
  params: Record<string, string>,
): Promise<TwilioInboundMessage> {
  const media = parseTwilioInboundMedia(params);
  if (media.length === 0) return inbound;

  const sharedContact = await resolveSharedContactFromMedia(media);
  if (sharedContact) return { ...inbound, sharedContact };

  if (inboundHasVcardMedia(media)) {
    return { ...inbound, vcardUnreadable: true };
  }

  return inbound;
}
