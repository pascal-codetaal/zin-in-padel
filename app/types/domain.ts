export type ActiveFlow =
  | "onboarding"
  | "favorites"
  | "match_creation"
  | null;

/**
 * Padel skill level — Tennis & Padel Vlaanderen classification.
 * Stored as the numeric "P" value (e.g. 100 represents P100).
 */
export type PadelLevel =
  | 50
  | 100
  | 200
  | 300
  | 400
  | 500
  | 700
  | 1000;

export type Gender = "m" | "w";

/** Heren: P100 → P1000. */
export const MENS_PADEL_LEVELS: readonly PadelLevel[] = [
  100, 200, 300, 400, 500, 700, 1000,
] as const;

/** Dames: P50 → P700. */
export const WOMENS_PADEL_LEVELS: readonly PadelLevel[] = [
  50, 100, 200, 300, 400, 500, 700,
] as const;

export const ALL_PADEL_LEVELS: readonly PadelLevel[] = [
  50, 100, 200, 300, 400, 500, 700, 1000,
] as const;

export type MatchPreference = "friends_only" | "level_only" | "open";

/** Court side a player prefers. "left" / "right" as seen from baseline facing the net. */
export type PreferredSide = "left" | "right";

/** Player key — normalized mobile number, e.g. +32470123456 */
export type PlayerRef = string;

/** Name given; waiting for mobile number before adding as friend. */
export type PendingFriend = {
  name: string;
};

export type User = {
  id: string;
  /** Secret token for the personal /maatjes/:token manage page. */
  manageToken: string;
  waId: string;
  /** WhatsApp address, e.g. whatsapp:+32470123456 */
  phone: string;
  profileName: string;
  firstName: string | null;
  lastName: string | null;
  optedIn: boolean;
  onboardingComplete: boolean;
  activeFlow: ActiveFlow;
  pendingFriend: PendingFriend | null;
  gender: Gender | null;
  level: PadelLevel | null;
  preferredSide: PreferredSide | null;
  playsBothSides: boolean;
  favoritePlayerRefs: string[];
  /** Per-user nickname per favorite ref. Falls back to Player.name when absent. */
  favoriteNames: Record<PlayerRef, string>;
  preferredClubIds: string[];
  matchPreference: MatchPreference | null;
  matchLevelMin: PadelLevel | null;
  matchLevelMax: PadelLevel | null;
  createdAt: string;
  updatedAt: string;
};

export type Player = {
  ref: PlayerRef;
  name: string;
  phone: string;
};

export type Club = {
  id: string;
  name: string;
  city: string;
  province?: string;
  /**
   * Aliases learned from external sources (e.g. how Playtomic names this
   * venue). Used by `searchClubs` so future pastes resolve directly.
   */
  playtomicNames?: string[];
};

export type MessageDirection = "in" | "out";

export type Message = {
  id: string;
  userId: string;
  body: string;
  direction: MessageDirection;
  at: string;
};

export type Game = {
  id: string;
  title: string;
  scheduledAt: string;
  status: "open" | "full" | "cancelled";
};

/** Court format for a match — restricts who can fill the open slots. */
export type MatchFormat = "mixed" | "men_only" | "women_only";

export type MatchStatus =
  | "draft"
  | "open"
  | "confirmed"
  | "full"
  | "cancelled";

export type Match = {
  id: string;
  organizerId: string;
  /** @deprecated Prefer {@link Match.clubIds}; kept as first selected club. */
  clubId: string | null;
  /** Clubs where this match may be played (organizer picks from their profile clubs). */
  clubIds: string[];
  /** ISO date-time, local-time-shaped (e.g. 2026-05-23T19:00). */
  scheduledAt: string | null;
  durationMinutes: number;
  format: MatchFormat;
  /**
   * Total court slots — padel = 4.
   */
  totalSlots: number;
  /**
   * Names of players already confirmed (from a Playtomic paste's ✅ lines,
   * or just the organizer for wizard-created matches). These are "free"
   * confirmations — they don't go through the invite/accept flow.
   */
  confirmedSlotNames: string[];
  /** Friend refs invited explicitly (subset of organizer.favoritePlayerRefs). */
  invitedFriendRefs: string[];
  /** Phase 1: invite selected friends via WhatsApp (wizard default on). */
  inviteFriendsEnabled: boolean;
  /**
   * Full invite lifecycle for this match — single source of truth for who was
   * invited, in which cascade phase, and how they responded. The set of
   * accepted player refs is derived via {@link acceptedPlayerRefsOf}.
   */
  invitedPlayers: MatchInvite[];
  /** Cascade phase 2: fall back to players matching the P-range. */
  fallbackToLevelRange: boolean;
  fallbackLevelMin: PadelLevel | null;
  fallbackLevelMax: PadelLevel | null;
  /** Minutes after the initial invite send before phase 2 kicks in. */
  fallbackLevelDelayMinutes: number;
  /** Cascade phase 3: open the match to everyone if still not full. */
  fallbackToEveryone: boolean;
  /** Minutes after the initial invite send before phase 3 kicks in. */
  fallbackEveryoneDelayMinutes: number;
  /** 0 = not started, 1 = friends fired, 2 = level fired, 3 = everyone fired. */
  currentCascadePhase: 0 | 1 | 2 | 3;
  /** When the next cascade tick should consider this match (null = done). */
  nextCascadeAt: string | null;
  status: MatchStatus;
  createdAt: string;
  updatedAt: string;
};

export type MatchInviteStatus = "pending" | "accepted" | "declined" | "expired";

export type MatchInvite = {
  playerRef: string;
  token: string;
  status: MatchInviteStatus;
  cascadePhase: 1 | 2 | 3;
  sentAt: string | null;
  respondedAt: string | null;
};

/** Player refs that explicitly accepted the invite (FCFS-confirmed). */
export function acceptedPlayerRefsOf(match: Match): string[] {
  return match.invitedPlayers
    .filter((i) => i.status === "accepted")
    .map((i) => i.playerRef);
}

/** How many open spots remain on a match (confirmed + accepted count as filled). */
export function openSlotsOf(match: Match): number {
  return Math.max(
    0,
    match.totalSlots -
      match.confirmedSlotNames.length -
      acceptedPlayerRefsOf(match).length,
  );
}

/** True once the cascade should stop sending / accepting new invites. */
export function isMatchFull(match: Match): boolean {
  return openSlotsOf(match) === 0;
}

export type Database = {
  users: User[];
  players: Player[];
  games: Game[];
  matches?: Match[];
  messages: Message[];
};

export function isPadelLevel(value: unknown): value is PadelLevel {
  return (
    typeof value === "number" &&
    (ALL_PADEL_LEVELS as readonly number[]).includes(value)
  );
}

export function levelsForGender(gender: Gender | null): readonly PadelLevel[] {
  if (gender === "m") return MENS_PADEL_LEVELS;
  if (gender === "w") return WOMENS_PADEL_LEVELS;
  return ALL_PADEL_LEVELS;
}

/** "P100", "P50", etc. */
export function formatPadelLevel(level: PadelLevel): string {
  return `P${level}`;
}

/** Badge on friend tiles in the match wizard. */
export function formatPadelLevelLabel(
  level: PadelLevel | null,
  isAppUser = true,
): string {
  if (!isAppUser) return "Gast";
  return level !== null ? formatPadelLevel(level) : "Ongekend";
}

/** Compact rating for UI badges, e.g. P270 → "2,7". */
export function formatPadelLevelCompact(level: PadelLevel): string {
  return (level / 100).toLocaleString("nl-BE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Snap an arbitrary numeric input to the closest valid level for the gender.
 * Returns null if input is null or not numeric.
 */
export function clampLevelToGender(
  value: number | null | undefined,
  gender: Gender | null,
): PadelLevel | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const allowed = levelsForGender(gender);
  if (allowed.length === 0) return null;
  if (isPadelLevel(value) && allowed.includes(value)) return value;
  let best = allowed[0]!;
  let bestDist = Math.abs(value - best);
  for (const candidate of allowed) {
    const d = Math.abs(value - candidate);
    if (d < bestDist) {
      best = candidate;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Step up or down one position in the gender's level ladder.
 * Returns the endpoint if already at the edge.
 */
export function stepLevel(
  level: PadelLevel,
  direction: "up" | "down",
  gender: Gender | null,
): PadelLevel {
  const ladder = levelsForGender(gender);
  const idx = ladder.indexOf(level);
  if (idx === -1) {
    return clampLevelToGender(level, gender) ?? ladder[0]!;
  }
  if (direction === "up") {
    return ladder[Math.min(ladder.length - 1, idx + 1)]!;
  }
  return ladder[Math.max(0, idx - 1)]!;
}

export function playerRefFromPhone(phone: string): PlayerRef {
  return phone;
}

/**
 * Display name for a favorite from the viewer's perspective: the viewer's own
 * nickname wins, then the canonical Player name, then a fallback. Keeps the
 * per-user nickname decoupled from the shared Player/User identity.
 */
export function resolveFavoriteName(
  favoriteNames: Record<PlayerRef, string>,
  ref: PlayerRef,
  playerName: string | null | undefined,
  fallback: string,
): string {
  return favoriteNames[ref] || playerName || fallback;
}

/** Human-readable side label ("links" / "rechts", "beide kanten", …). */
export function formatPreferredSide(
  side: PreferredSide | null,
  playsBothSides: boolean,
): string {
  if (playsBothSides && side === null) return "beide kanten";
  const base = side === "left" ? "links" : "rechts";
  return playsBothSides ? `${base} (beide kanten)` : base;
}

export function formatMatchFormat(format: MatchFormat): string {
  if (format === "mixed") return "Mixed";
  if (format === "men_only") return "Heren";
  return "Dames";
}

/** Default format for a match created by a user of the given gender. */
export function defaultMatchFormatFor(gender: Gender | null): MatchFormat {
  if (gender === "m") return "men_only";
  if (gender === "w") return "women_only";
  return "mixed";
}
