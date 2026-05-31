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

/** Next upcoming datetime from Dutch fragments (e.g. "vrijdag 29, 11:00"). */
export function parseDutchDateTime(
  input: ParseDutchDateTimeInput,
): ParseDutchDateTimeResult {
  const { weekday, day, hour, minute } = input;
  const now = new Date();
  let target: Date | null = null;
  let note: string | undefined;

  if (typeof day === "number") {
    for (let i = 0; i < 62; i++) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + i);
      if (candidate.getDate() === day) {
        candidate.setHours(hour, minute, 0, 0);
        if (candidate.getTime() <= now.getTime() && i === 0) continue;
        if (weekday) {
          const wIdx = dutchWeekdays.indexOf(weekday);
          if (candidate.getDay() !== wIdx) continue;
        }
        target = candidate;
        break;
      }
    }
    if (!target && weekday) {
      note =
        "Geen volgende datum gevonden die dag-van-maand én weekdag combineert.";
    }
  }

  if (!target && weekday) {
    const wIdx = dutchWeekdays.indexOf(weekday);
    const t = new Date(now);
    const offset = (wIdx - t.getDay() + 7) % 7 || 7;
    t.setDate(t.getDate() + offset);
    t.setHours(hour, minute, 0, 0);
    target = t;
  }

  if (!target) {
    throw new Error("Geef minstens `day` of `weekday` mee.");
  }

  return {
    iso: target.toISOString(),
    weekdayResolved: dutchWeekdays[target.getDay()]!,
    note,
  };
}

export function parseDutchWeekdayToken(
  token: string,
): DutchWeekday | undefined {
  const normalized = token.trim().toLowerCase();
  return dutchWeekdays.find((d) => d === normalized);
}
