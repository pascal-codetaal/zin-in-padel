import type {
  Gender,
  MatchPreference,
  PadelLevel,
  PreferredSide,
} from "~/types/domain";

export type ProfielFormUser = {
  firstName: string | null;
  lastName: string | null;
  gender: Gender | null;
  level: PadelLevel | null;
  preferredSide: PreferredSide | null;
  playsBothSides: boolean;
  matchPreference: MatchPreference | null;
  preferredClubIds: string[];
};

export const PROFIEL_STEP_SLUGS = [
  "basis",
  "kant",
  "speelvoorkeur",
  "clubs",
] as const;

export type ProfielStepSlug = (typeof PROFIEL_STEP_SLUGS)[number];

export function isProfielStepComplete(
  slug: ProfielStepSlug,
  user: ProfielFormUser,
): boolean {
  if (slug === "basis") {
    return (
      Boolean(user.firstName?.trim() && user.lastName?.trim()) &&
      user.gender !== null &&
      user.level !== null
    );
  }
  if (slug === "kant") {
    return user.preferredSide !== null || user.playsBothSides;
  }
  if (slug === "speelvoorkeur") {
    return user.matchPreference !== null;
  }
  if (slug === "clubs") {
    return user.preferredClubIds.length > 0;
  }
  return false;
}

export function isProfielFormComplete(user: ProfielFormUser): boolean {
  return PROFIEL_STEP_SLUGS.every((slug) => isProfielStepComplete(slug, user));
}
