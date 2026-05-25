/** Public webhook URL Twilio posts to (for signature validation). Override when behind a tunnel. */
export function getTwilioWebhookUrl(request: Request): string {
  const override = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (override) return override;
  return new URL(request.url).toString();
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
