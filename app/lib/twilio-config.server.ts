/** Public webhook URL Twilio posts to (for signature validation). Override when behind a tunnel. */
export function getTwilioWebhookUrl(request: Request): string {
  const requestUrl = new URL(request.url).toString();
  const override = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (!override) return requestUrl;

  // Ignore stale tunnel URLs on Vercel (env changes need redeploy; host mismatch is a safe fallback).
  if (process.env.VERCEL) {
    try {
      if (new URL(override).host !== new URL(requestUrl).host) {
        return requestUrl;
      }
    } catch {
      return requestUrl;
    }
  }

  return override;
}

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim(),
  );
}

/** Log outbound instead of calling Twilio API (local / CI). */
export function isTwilioMock(): boolean {
  return process.env.TWILIO_MOCK === "true";
}

export function shouldValidateTwilioSignature(): boolean {
  if (process.env.TWILIO_VALIDATE_SIGNATURE === "false") return false;
  return isTwilioConfigured();
}
