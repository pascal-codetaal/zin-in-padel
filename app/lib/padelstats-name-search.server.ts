/** Normalize for case- and accent-insensitive substring matching. */
export function normalizeForNameSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ");
}

export function nameSearchTokens(query: string): string[] {
  return normalizeForNameSearch(query)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** All tokens must appear somewhere in the name (order-independent). */
export function memberNameMatchesQuery(name: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const normalized = normalizeForNameSearch(name);
  return tokens.every((t) => normalized.includes(t));
}
