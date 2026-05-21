import {
  isPadelLevel,
  type Gender,
  type MatchPreference,
  type PadelLevel,
  type PreferredSide,
} from "~/types/domain";

export function parseLevel(
  value: FormDataEntryValue | null,
): PadelLevel | null {
  if (value === null) return null;
  const str = value.toString().trim();
  if (str === "" || str === "none") return null;
  const num = Number.parseInt(str, 10);
  if (Number.isNaN(num) || !isPadelLevel(num)) return null;
  return num;
}

export function parseGender(value: FormDataEntryValue | null): Gender | null {
  const str = value?.toString().trim() ?? "";
  if (str === "m" || str === "w") return str;
  return null;
}

export function parseMatchPreference(
  value: FormDataEntryValue | null,
): MatchPreference | null {
  const str = value?.toString().trim() ?? "";
  if (str === "friends_only" || str === "level_only" || str === "open") {
    return str;
  }
  return null;
}

export function parsePreferredSide(
  value: FormDataEntryValue | null,
): PreferredSide | null {
  const str = value?.toString().trim() ?? "";
  if (str === "left" || str === "right") return str;
  return null;
}

export function parseCheckbox(value: FormDataEntryValue | null): boolean {
  if (value === null) return false;
  const str = value.toString().trim().toLowerCase();
  return str === "on" || str === "true" || str === "1";
}
