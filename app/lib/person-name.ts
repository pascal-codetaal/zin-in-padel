/** Split "Jan Janssens" → { firstName: "Jan", lastName: "Janssens" }. */
export function parsePersonName(full: string): {
  firstName: string;
  lastName: string | null;
} {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: "", lastName: null };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { firstName: trimmed, lastName: null };
  return {
    firstName: trimmed.slice(0, space).trim(),
    lastName: trimmed.slice(space + 1).trim() || null,
  };
}

export function formatPersonName(parts: {
  firstName?: string | null;
  lastName?: string | null;
  /** Fallback when structured names are missing (WhatsApp profile, legacy). */
  profileName?: string | null;
  fallback?: string;
}): string {
  const first = parts.firstName?.trim() ?? "";
  const last = parts.lastName?.trim() ?? "";
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  const profile = parts.profileName?.trim();
  if (profile) return profile;
  return parts.fallback ?? "—";
}

/** First token of a display name (invite greeting). */
export function firstNameFromDisplayName(displayName: string): string {
  return parsePersonName(displayName).firstName || displayName.trim() || "daar";
}

export function syncProfileNameFromParts(parts: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return formatPersonName({ ...parts, fallback: "" });
}

/** Voornaam + familienaam voor weergave (fallback naar profileName). */
export function resolveUserNameParts(user: {
  firstName?: string | null;
  lastName?: string | null;
  profileName?: string | null;
}): { firstName: string; lastName: string } {
  const storedFirst = user.firstName?.trim() ?? "";
  const storedLast = user.lastName?.trim() ?? "";
  if (storedFirst || storedLast) {
    return {
      firstName: storedFirst || "—",
      lastName: storedLast || "—",
    };
  }

  const parsed = parsePersonName(user.profileName ?? "");
  if (parsed.firstName || parsed.lastName) {
    return {
      firstName: parsed.firstName || "—",
      lastName: parsed.lastName || "—",
    };
  }

  const profile = user.profileName?.trim();
  return {
    firstName: profile || "—",
    lastName: "—",
  };
}
