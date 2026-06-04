/**
 * Pure helpers for match-wizard defaults and date-input formatting.
 * Used in both loaders/actions and components.
 *
 * All wall-clock <-> instant conversions are pinned to {@link APP_TIME_ZONE}
 * so scheduling is identical on the UTC server and the browser client.
 */

import {
  APP_TIME_ZONE,
  getZonedParts,
  zonedWallTimeToInstant,
  zonedWeekday,
} from "~/lib/timezone";

/** Compute the next upcoming Saturday at 19:00 Brussels time. */
export function nextSaturdayEvening(now: Date = new Date()): Date {
  const today = getZonedParts(now);
  const dayOfWeek = zonedWeekday(today.year, today.month, today.day); // 0 = Sun, 6 = Sat
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  const cal = new Date(Date.UTC(today.year, today.month - 1, today.day));
  cal.setUTCDate(cal.getUTCDate() + daysUntilSaturday);
  return zonedWallTimeToInstant({
    year: cal.getUTCFullYear(),
    month: cal.getUTCMonth() + 1,
    day: cal.getUTCDate(),
    hour: 19,
    minute: 0,
  });
}

/** Format an instant as a value for `<input type="datetime-local">` (Brussels wall time). */
export function toDatetimeLocalValue(d: Date): string {
  const p = getZonedParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Parse a `<input type="datetime-local">` value (Brussels wall time) to a UTC ISO string, or null. */
export function fromDatetimeLocalValue(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value.trim(),
  );
  if (!m) return null;
  const instant = zonedWallTimeToInstant({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
  });
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString();
}

/** Render a Match.scheduledAt for humans, in Brussels time. */
export function formatScheduledAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nl-BE", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const DURATION_OPTIONS = [60, 90, 120] as const;
