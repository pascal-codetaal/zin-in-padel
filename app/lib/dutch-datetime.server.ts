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

const relativeDayOffsets = {
  vandaag: 0,
  morgen: 1,
  overmorgen: 2,
} as const;

export type RelativeDay = keyof typeof relativeDayOffsets;

export type ParseDutchDateTimeInput = {
  /** "vandaag" | "morgen" | "overmorgen" — wins over weekday/day when set. */
  relativeDay?: RelativeDay;
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
  const { relativeDay, weekday, day, hour, minute } = input;
  const now = new Date();
  const today = getZonedParts(now);
  // Calendar cursor anchored at Brussels "today", advanced in pure UTC-calendar
  // space so day arithmetic never drifts across DST.
  const base = Date.UTC(today.year, today.month - 1, today.day);
  const weekdayIdx = weekday ? dutchWeekdays.indexOf(weekday) : -1;
  let target: Date | null = null;
  let note: string | undefined;

  if (relativeDay) {
    const cal = new Date(base);
    cal.setUTCDate(cal.getUTCDate() + relativeDayOffsets[relativeDay]);
    target = zonedWallTimeToInstant({
      year: cal.getUTCFullYear(),
      month: cal.getUTCMonth() + 1,
      day: cal.getUTCDate(),
      hour,
      minute,
    });
  }

  if (!target && typeof day === "number") {
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
    throw new Error("Geef minstens `relativeDay`, `day` of `weekday` mee.");
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

const dutchMonths = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
] as const;

/** Brussels "today" as a Dutch label, e.g. "zondag 7 juni 2026". */
export function currentDutchDateLabel(now: Date = new Date()): string {
  const p = getZonedParts(now);
  const weekday = dutchWeekdays[zonedWeekday(p.year, p.month, p.day)]!;
  return `${weekday} ${p.day} ${dutchMonths[p.month - 1]} ${p.year}`;
}
