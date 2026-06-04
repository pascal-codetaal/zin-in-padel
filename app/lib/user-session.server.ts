import { updateUser } from "~/lib/db.server";
import { qualifyReferralForUser } from "~/lib/referrals.server";
import type { ActiveFlow, User } from "~/types/domain";

const PROFILE_RESET = {
  firstName: null,
  lastName: null,
  gender: null,
  level: null,
  preferredSide: null,
  playsBothSides: false,
  favoritePlayerRefs: [] as string[],
  preferredClubIds: [] as string[],
  matchPreference: null,
  matchLevelMin: null,
  matchLevelMax: null,
  pendingFriend: null,
} as const;

/** Opt-out + wipe profile (matches legacy STOP handler). */
export async function optOutUser(userId: string): Promise<User> {
  return updateUser(userId, {
    optedIn: false,
    onboardingComplete: false,
    activeFlow: null,
    ...PROFILE_RESET,
  });
}

/** Opt-in + fresh onboarding (matches legacy JA handler). */
export async function optInUser(userId: string): Promise<User> {
  const user = await updateUser(userId, {
    optedIn: true,
    onboardingComplete: false,
    activeFlow: "onboarding",
    ...PROFILE_RESET,
  });
  await qualifyReferralForUser(userId);
  return user;
}

export async function setUserActiveFlow(
  userId: string,
  activeFlow: ActiveFlow,
): Promise<User> {
  return updateUser(userId, { activeFlow });
}
