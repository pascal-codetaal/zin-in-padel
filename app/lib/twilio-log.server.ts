const PREFIX = "[twilio:whatsapp]";

function preview(text: string, max = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export function logTwilio(
  event: string,
  details?: Record<string, unknown>,
): void {
  if (details) {
    console.info(PREFIX, event, details);
  } else {
    console.info(PREFIX, event);
  }
}

export function logTwilioWarn(
  event: string,
  details?: Record<string, unknown>,
): void {
  if (details) {
    console.warn(PREFIX, event, details);
  } else {
    console.warn(PREFIX, event);
  }
}

export function logTwilioError(
  event: string,
  error: unknown,
  details?: Record<string, unknown>,
): void {
  console.error(PREFIX, event, {
    ...details,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

/** Log raw Twilio POST fields useful for debugging inbound delivery. */
export function logTwilioInboundForm(
  params: FormData | Record<string, string>,
): void {
  const get = (key: string) =>
    (params instanceof FormData
      ? params.get(key)?.toString()
      : params[key]) ?? null;
  const body = get("Body") ?? "";
  logTwilio("inbound received", {
    messageSid: get("MessageSid"),
    accountSid: get("AccountSid"),
    from: get("From"),
    to: get("To"),
    waId: get("WaId"),
    profileName: get("ProfileName"),
    numMedia: get("NumMedia") ?? "0",
    bodyLength: body.length,
    bodyPreview: preview(body),
  });
}

export function logTwilioReply(
  reply: string,
  meta: { durationMs: number; waId: string; via?: "api" | "twiml" },
): void {
  const channel = meta.via === "api" ? "REST API" : "TwiML";
  logTwilio(`reply sent (${channel})`, {
    waId: meta.waId,
    durationMs: meta.durationMs,
    replyLength: reply.length,
    replyPreview: preview(reply),
  });
}
