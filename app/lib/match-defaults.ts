/**
 * Pure helpers for match-wizard defaults and date-input formatting.
 * Used in both loaders/actions and components.
 */

/** Compute the next upcoming Saturday at 19:00, local time. */
export function nextSaturdayEvening(now: Date = new Date()): Date {
  const target = new Date(now);
  const dayOfWeek = target.getDay(); // 0 = Sun, 6 = Sat
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  target.setDate(target.getDate() + daysUntilSaturday);
  target.setHours(19, 0, 0, 0);
  return target;
}

/** Format a Date as a value for `<input type="datetime-local">` (no timezone). */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a `<input type="datetime-local">` value to ISO string, or null if blank. */
export function fromDatetimeLocalValue(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Render a Match.scheduledAt for humans. */
export function formatScheduledAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const DURATION_OPTIONS = [60, 90, 120] as const;
