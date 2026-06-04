export const REFERRAL_CAMPAIGN = {
  slug: "launch-2026",
  title: "Vriendenactie",
  periodLabel: "Binnenkort",
  prizes: [
    "Padelracket t.w.v. x euro",
    "Tweede prijs, nog te bepalen",
    "Derde prijs, nog te bepalen",
  ],
} as const;

export const REFERRAL_STATUSES = {
  pending: "pending",
  qualified: "qualified",
  disqualified: "disqualified",
} as const;

export type ReferralStatus =
  (typeof REFERRAL_STATUSES)[keyof typeof REFERRAL_STATUSES];

const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{6,16}$/;

export function normalizeReferralCode(value: string): string | null {
  const code = value.trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export function parseReferralCodeFromMessage(message: string): string | null {
  const text = message.trim();
  const match = text.match(/\b(?:START\s+)?REF(?:ERRAL)?\s+([a-z0-9-]{6,24})\b/i);
  if (!match?.[1]) return null;
  return normalizeReferralCode(match[1]);
}

export function buildReferralBotMessage(code: string): string {
  return `REF ${code}`;
}
