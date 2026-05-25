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
export function logTwilioInboundForm(form: FormData): void {
  const body = form.get("Body")?.toString() ?? "";
  logTwilio("inbound received", {
    messageSid: form.get("MessageSid")?.toString() ?? null,
    accountSid: form.get("AccountSid")?.toString() ?? null,
    from: form.get("From")?.toString() ?? null,
    to: form.get("To")?.toString() ?? null,
    waId: form.get("WaId")?.toString() ?? null,
    profileName: form.get("ProfileName")?.toString() ?? null,
    numMedia: form.get("NumMedia")?.toString() ?? "0",
    bodyLength: body.length,
    bodyPreview: preview(body),
  });
}

export function logTwilioReply(
  reply: string,
  meta: { durationMs: number; waId: string },
): void {
  logTwilio("reply sent (TwiML)", {
    waId: meta.waId,
    durationMs: meta.durationMs,
    replyLength: reply.length,
    replyPreview: preview(reply),
  });
}
