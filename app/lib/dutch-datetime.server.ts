import {
  getZonedParts,
  zonedWallTimeToInstant,
  zonedWeekday,
} from "~/lib/timezone";

const dutchWeekdays = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
] as const;

export type DutchWeekday = (typeof dutchWeekdays)[number];

export type ParseDutchDateTimeInput = {
  weekday?: DutchWeekday;
  day?: number;
  hour: number;
  minute: number;
};

export type ParseDutchDateTimeResult = {
  iso: string;
  weekdayResolved: DutchWeekday;
  note?: string;
};

/** Next upcoming datetime from Dutch fragments (e.g. "vrijdag 29, 11:00"), in Brussels time. */
export function parseDutchDateTime(
  input: ParseDutchDateTimeInput,
): ParseDutchDateTimeResult {
  const { weekday, day, hour, minute } = input;
  const now = new Date();
  const today = getZonedParts(now);
  // Calendar cursor anchored at Brussels "today", advanced in pure UTC-calendar
  // space so day arithmetic never drifts across DST.
  const base = Date.UTC(today.year, today.month - 1, today.day);
  const weekdayIdx = weekday ? dutchWeekdays.indexOf(weekday) : -1;
  let target: Date | null = null;
  let note: string | undefined;

  if (typeof day === "number") {
    for (let i = 0; i < 62; i++) {
      const cal = new Date(base);
      cal.setUTCDate(cal.getUTCDate() + i);
      if (cal.getUTCDate() !== day) continue;
      if (weekday && cal.getUTCDay() !== weekdayIdx) continue;
      const candidate = zonedWallTimeToInstant({
        year: cal.getUTCFullYear(),
        month: cal.getUTCMonth() + 1,
        day: cal.getUTCDate(),
        hour,
        minute,
      });
      if (candidate.getTime() <= now.getTime()) continue;
      target = candidate;
      break;
    }
    if (!target && weekday) {
      note =
        "Geen volgende datum gevonden die dag-van-maand én weekdag combineert.";
    }
  }

  if (!target && weekday) {
    const offset = (weekdayIdx - new Date(base).getUTCDay() + 7) % 7 || 7;
    const cal = new Date(base);
    cal.setUTCDate(cal.getUTCDate() + offset);
    target = zonedWallTimeToInstant({
      year: cal.getUTCFullYear(),
      month: cal.getUTCMonth() + 1,
      day: cal.getUTCDate(),
      hour,
      minute,
    });
  }

  if (!target) {
    throw new Error("Geef minstens `day` of `weekday` mee.");
  }

  const resolved = getZonedParts(target);
  return {
    iso: target.toISOString(),
    weekdayResolved:
      dutchWeekdays[zonedWeekday(resolved.year, resolved.month, resolved.day)]!,
    note,
  };
}

export function parseDutchWeekdayToken(
  token: string,
): DutchWeekday | undefined {
  const normalized = token.trim().toLowerCase();
  return dutchWeekdays.find((d) => d === normalized);
}
