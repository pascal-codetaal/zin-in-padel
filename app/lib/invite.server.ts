const OPT_IN_PREFILL = "JA";

function whatsAppNumberFromEnv(from: string | undefined): string | null {
  if (!from?.trim()) return null;
  const digits = from.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

/** wa.me link that opens a chat with the bot and pre-fills the opt-in command. */
export function buildWhatsAppInviteUrl(
  twilioWhatsAppFrom: string | undefined,
): string | null {
  const number = whatsAppNumberFromEnv(twilioWhatsAppFrom);
  if (!number) return null;

  const text = encodeURIComponent(OPT_IN_PREFILL);
  return `https://wa.me/${number}?text=${text}`;
}

export function invitePrefillMessage(): string {
  return OPT_IN_PREFILL;
}
