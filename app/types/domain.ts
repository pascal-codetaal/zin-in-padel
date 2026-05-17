export type ActiveFlow = "onboarding" | "favorites" | null;

/** Padel skill level on a 1–7 scale (common in BE/NL). */
export type PadelLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type MatchPreference = "friends_only" | "level_only" | "open";

/** Player key — normalized mobile number, e.g. +32470123456 */
export type PlayerRef = string;

/** Name given; waiting for mobile number before adding as friend. */
export type PendingFriend = {
  name: string;
};

export type User = {
  id: string;
  waId: string;
  /** WhatsApp address, e.g. whatsapp:+32470123456 */
  phone: string;
  profileName: string;
  optedIn: boolean;
  onboardingComplete: boolean;
  activeFlow: ActiveFlow;
  pendingFriend: PendingFriend | null;
  level: number | null;
  favoritePlayerRefs: string[];
  preferredClubIds: string[];
  matchPreference: MatchPreference | null;
  matchLevelMin: number | null;
  matchLevelMax: number | null;
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

export type Database = {
  users: User[];
  players: Player[];
  games: Game[];
  messages: Message[];
};

export const PADEL_LEVEL_MIN = 1;
export const PADEL_LEVEL_MAX = 7;

export function isPadelLevel(value: number): value is PadelLevel {
  return (
    Number.isInteger(value) &&
    value >= PADEL_LEVEL_MIN &&
    value <= PADEL_LEVEL_MAX
  );
}

export function playerRefFromPhone(phone: string): PlayerRef {
  return phone;
}
