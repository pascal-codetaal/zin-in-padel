/**
 * Opaque base62, 22 chars — per-invite deep-link token.
 * See docs/adr/0002-collapse-accepted-into-invited.md.
 */
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function createInviteToken(): string {
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 62];
  return out;
}
