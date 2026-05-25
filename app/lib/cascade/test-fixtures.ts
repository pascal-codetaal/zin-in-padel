/**
 * Builders for cascade unit-test fixtures. Centralised so tests stay
 * concise and we change one place when the Match shape evolves.
 */

import type { Match, MatchInvite, User } from "~/types/domain";

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user_candidate",
    manageToken: "mt_abc",
    waId: "+32470000001",
    phone: "whatsapp:+32470000001",
    profileName: "Candidate",
    optedIn: true,
    onboardingComplete: true,
    activeFlow: null,
    pendingFriend: null,
    gender: "m",
    level: 300,
    preferredSide: null,
    playsBothSides: false,
    favoritePlayerRefs: [],
    preferredClubIds: ["club_1"],
    matchPreference: "open",
    matchLevelMin: null,
    matchLevelMax: null,
    createdAt: "2026-05-30T10:00:00.000Z",
    updatedAt: "2026-05-30T10:00:00.000Z",
    ...overrides,
  };
}

export function makeInvite(overrides: Partial<MatchInvite> = {}): MatchInvite {
  return {
    playerRef: "player_invite",
    token: "abc123abc123abc123abc1",
    status: "pending",
    cascadePhase: 1,
    sentAt: null,
    respondedAt: null,
    ...overrides,
  };
}

export function makeMatch(overrides: Partial<Match> = {}): Match {
  const clubIds =
    overrides.clubIds ??
    (overrides.clubId ? [overrides.clubId] : ["club_1"]);
  const clubId = overrides.clubId ?? clubIds[0] ?? null;
  return {
    id: "match_1",
    organizerId: "user_organizer",
    clubId,
    clubIds,
    scheduledAt: "2026-06-01T19:00:00.000Z",
    durationMinutes: 90,
    format: "mixed",
    totalSlots: 4,
    confirmedSlotNames: ["Organiser"],
    invitedFriendRefs: [],
    invitedPlayers: [],
    fallbackToLevelRange: false,
    fallbackLevelMin: null,
    fallbackLevelMax: null,
    fallbackLevelDelayMinutes: 30,
    fallbackToEveryone: false,
    fallbackEveryoneDelayMinutes: 60,
    currentCascadePhase: 0,
    nextCascadeAt: null,
    status: "open",
    createdAt: "2026-05-30T10:00:00.000Z",
    updatedAt: "2026-05-30T10:00:00.000Z",
    ...overrides,
  };
}
