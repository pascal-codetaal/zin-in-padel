/**
 * Single source of truth for civil-time handling.
 *
 * The app stores every instant as UTC (Prisma `DateTime`, ISO strings with a
 * `Z`), but humans schedule and read matches in Belgian wall-clock time. Server
 * processes (Fly.io / Alpine) run in UTC, while the browser runs in the user's
 * local zone — so any `new Date(wallClock)` / `toLocaleString` without an
 * explicit zone silently disagrees between WhatsApp (server) and the dashboard
 * (client). Pinning everything to {@link APP_TIME_ZONE} makes scheduling and
 * formatting deterministic regardless of where the code runs.
 */

/** Civil time zone for all match scheduling. CET/CEST (same offset as Amsterdam). */
export const APP_TIME_ZONE = "Europe/Brussels";

export type WallTime = {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  minute: number;
  second: number;
};

const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** The {@link APP_TIME_ZONE} wall-clock fields of a UTC instant. */
export function getZonedParts(instant: Date): WallTime {
  const map: Record<string, string> = {};
  for (const part of PARTS_FORMAT.formatToParts(instant)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset in ms to add to UTC to reach {@link APP_TIME_ZONE} wall time at `instant`. */
function offsetMsAt(instant: Date): number {
  const p = getZonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/**
 * Convert a wall-clock time in {@link APP_TIME_ZONE} to its UTC instant.
 *
 * Uses the standard two-pass offset correction so it stays correct across DST
 * boundaries (the zone offset at the naive guess may differ from the offset at
 * the resolved instant).
 */
export function zonedWallTimeToInstant(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = offsetMsAt(new Date(utcGuess));
  let instant = utcGuess - offset1;
  const offset2 = offsetMsAt(new Date(instant));
  if (offset2 !== offset1) instant = utcGuess - offset2;
  return new Date(instant);
}

/** Day of week (0 = Sunday) of a {@link APP_TIME_ZONE} calendar date. */
export function zonedWeekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
