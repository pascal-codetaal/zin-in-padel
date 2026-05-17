/** Extract and normalize a mobile number from free text (BE/NL friendly). */
export function parsePhoneFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Prefer explicit +32 / +31 international forms
  const intl = trimmed.match(/(\+3[12]\d[\d\s./-]{7,12}\d)/);
  if (intl) {
    return normalizePhoneDigits(intl[1]!);
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 9) return null;

  if (digits.startsWith("32") && digits.length >= 11) {
    return `+${digits}`;
  }
  if (digits.startsWith("31") && digits.length >= 11) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+32${digits.slice(1)}`;
  }
  if (digits.length === 9 && digits.startsWith("4")) {
    return `+32${digits}`;
  }

  return `+${digits}`;
}

function normalizePhoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+32${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("4")) return `+32${digits}`;
  return `+${digits}`;
}

export function isPhoneLikeMessage(text: string): boolean {
  const digits = text.replace(/\D/g, "");
  return digits.length >= 9;
}
