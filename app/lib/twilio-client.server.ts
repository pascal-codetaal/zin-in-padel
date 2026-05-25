import twilio from "twilio";
import {
  isTwilioConfigured,
  isTwilioMock,
} from "~/lib/twilio-config.server";

let client: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;
  if (!client) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

export function normalizeWhatsAppAddress(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  if (trimmed.startsWith("+")) return `whatsapp:${trimmed}`;
  return `whatsapp:+${trimmed.replace(/\D/g, "")}`;
}

export function validateTwilioWebhookSignature(
  request: Request,
  form: FormData,
  webhookUrl: string,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("X-Twilio-Signature");
  if (!authToken || !signature) return false;

  const params = Object.fromEntries(form.entries()) as Record<string, string>;
  return twilio.validateRequest(authToken, signature, webhookUrl, params);
}

/**
 * Send an outbound WhatsApp message via Twilio REST API.
 * No-op when mock mode; throws when not configured.
 */
export async function sendTwilioWhatsAppMessage(
  to: string,
  body: string,
): Promise<void> {
  if (isTwilioMock()) {
    console.info("[twilio:mock] outbound", { to, body });
    return;
  }

  const twilioClient = getTwilioClient();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!twilioClient || !from) {
    throw new Error("Twilio is not configured (TWILIO_* env vars).");
  }

  await twilioClient.messages.create({
    from,
    to: normalizeWhatsAppAddress(to),
    body,
  });
}
