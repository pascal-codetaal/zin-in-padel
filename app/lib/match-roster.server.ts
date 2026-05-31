import type { MatchPickerPlayer } from "~/lib/match-picker";

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Match a display name (e.g. from Playtomic ✅ lines) to a favorite player ref.
 * Exact match first, then conservative fuzzy (single candidate only).
 */
export function findPlayerRefByFuzzyName(
  name: string,
  players: MatchPickerPlayer[],
): string | null {
  const key = normalizeName(name);
  if (!key) return null;

  const exact = players.find((p) => normalizeName(p.name) === key);
  if (exact) return exact.ref;

  const containsMatches = players.filter((p) => {
    const pKey = normalizeName(p.name);
    return pKey.includes(key) || key.includes(pKey);
  });
  if (containsMatches.length === 1) return containsMatches[0]!.ref;

  const tokens = key.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return null;

  const tokenMatches = players.filter((p) => {
    const pTokens = normalizeName(p.name).split(/\s+/).filter(Boolean);
    return tokens.every((t) =>
      pTokens.some((pt) => pt.startsWith(t) || t.startsWith(pt)),
    );
  });
  if (tokenMatches.length === 1) return tokenMatches[0]!.ref;

  return null;
}

/** Player refs already on the court (organizer excluded by name; fuzzy ✅ → maatjes). */
export function playerRefsOnCourtFromRoster(input: {
  organizerName: string;
  confirmedSlotNames: string[];
  players: MatchPickerPlayer[];
  extraRefs?: Iterable<string>;
}): Set<string> {
  const refs = new Set<string>(input.extraRefs ?? []);
  const orgKey = normalizeName(input.organizerName);

  for (const name of input.confirmedSlotNames) {
    if (normalizeName(name) === orgKey) continue;
    const ref = findPlayerRefByFuzzyName(name, input.players);
    if (ref) refs.add(ref);
  }

  return refs;
}

export function filterInvitableFriendRefs(
  friendRefs: string[],
  onCourtRefs: Set<string>,
): string[] {
  return friendRefs.filter((ref) => !onCourtRefs.has(ref));
}
