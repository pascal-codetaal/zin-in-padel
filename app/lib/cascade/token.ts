/**
 * Opaque base62, 22-char invite token. Lives in `cascade/` for cohesion
 * with the rest of the invite flow, even though token creation is an
 * adapter-side concern per ADR-0004 (uses platform randomness; the pure
 * decision/audience/format functions never call this).
 *
 * 22 chars × 6 bits = 132 bits of entropy → collisions are effectively
 * impossible across the project's lifetime.
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const INVITE_TOKEN_LENGTH = 22;
export const INVITE_TOKEN_ALPHABET = ALPHABET;

export function createInviteToken(): string {
  const bytes = new Uint8Array(INVITE_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** True if `s` is the shape of a freshly-generated invite token. */
export function isValidInviteTokenShape(s: string): boolean {
  if (s.length !== INVITE_TOKEN_LENGTH) return false;
  for (let i = 0; i < s.length; i++) {
    if (!ALPHABET.includes(s[i]!)) return false;
  }
  return true;
}
