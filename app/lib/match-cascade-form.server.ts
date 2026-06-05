import type { Gender, PadelLevel } from "~/types/domain";
import { levelsForGender, stepLevel } from "~/types/domain";
import { parseLevel } from "~/lib/profile-form.server";

export type CascadeFormInput = {
  gender: Gender | null;
  level: PadelLevel | null;
  matchLevelMin: PadelLevel | null;
  matchLevelMax: PadelLevel | null;
};

export type CascadeDraftFlags = {
  inviteFriendsEnabled: boolean;
  fallbackToLevelRange: boolean;
  fallbackLevelMin: PadelLevel | null;
  fallbackLevelMax: PadelLevel | null;
  fallbackLevelDelayMinutes: number;
  fallbackToEveryone: boolean;
  fallbackEveryoneDelayMinutes: number;
};

export function defaultLevelRange(input: CascadeFormInput): {
  min: PadelLevel;
  max: PadelLevel;
} {
  const available = levelsForGender(input.gender);
  const min =
    input.matchLevelMin ??
    (input.level !== null
      ? stepLevel(input.level, "down", input.gender)
      : available[0]!);
  const max =
    input.matchLevelMax ??
    (input.level !== null
      ? stepLevel(input.level, "up", input.gender)
      : available[available.length - 1]!);
  return { min, max };
}

/** Friends off: empty invites + immediate level fallback. */
export function inferInviteFriendsEnabled(draft: {
  invitedFriendRefs: string[];
  fallbackToLevelRange: boolean;
  fallbackLevelDelayMinutes: number;
  fallbackToEveryone: boolean;
}): boolean {
  if (draft.invitedFriendRefs.length > 0) return true;
  return !(
    draft.fallbackToLevelRange &&
    draft.fallbackLevelDelayMinutes === 0 &&
    !draft.fallbackToEveryone
  );
}

function parseDelay(value: FormDataEntryValue | null, fallback: number): number {
  if (value === null) return fallback;
  const n = Number.parseInt(value.toString(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 1440) return fallback;
  return n;
}

export function parseCascadeFromForm(
  form: FormData,
  organizer: CascadeFormInput,
): CascadeDraftFlags {
  const inviteFriendsEnabled = form.get("inviteFriendsEnabled") === "on";
  const { min: defaultMin, max: defaultMax } = defaultLevelRange(organizer);

  if (!inviteFriendsEnabled) {
    return {
      inviteFriendsEnabled: false,
      fallbackToLevelRange: true,
      fallbackLevelMin: defaultMin,
      fallbackLevelMax: defaultMax,
      fallbackLevelDelayMinutes: 0,
      fallbackToEveryone: false,
      fallbackEveryoneDelayMinutes: 60,
    };
  }

  const fallbackToLevelRange = form.get("fallbackToLevelRange") === "on";

  return {
    inviteFriendsEnabled: true,
    fallbackToLevelRange,
    fallbackLevelMin: fallbackToLevelRange
      ? parseLevel(form.get("fallbackLevelMin"))
      : null,
    fallbackLevelMax: fallbackToLevelRange
      ? parseLevel(form.get("fallbackLevelMax"))
      : null,
    fallbackLevelDelayMinutes: parseDelay(
      form.get("fallbackLevelDelayMinutes"),
      30,
    ),
    fallbackToEveryone: false,
    fallbackEveryoneDelayMinutes: parseDelay(
      form.get("fallbackEveryoneDelayMinutes"),
      60,
    ),
  };
}
