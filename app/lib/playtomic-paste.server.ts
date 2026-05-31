import { addPlaytomicAlias, searchClubs } from "~/lib/clubs.server";
import {
  findOrCreateDraftMatch,
  findUserById,
  updateMatchDraft,
} from "~/lib/db.server";
import {
  parseDutchDateTime,
  parseDutchWeekdayToken,
} from "~/lib/dutch-datetime.server";
import {
  buildDraftMatchOverviewUrl,
  buildNewMatchPageUrl,
} from "~/lib/maatjes-url.server";
import {
  filterInvitableFriendRefs,
  getMatchPickerPlayers,
  playerRefsOnCourtFromRoster,
} from "~/lib/match-picker.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import { formatPersonName } from "~/lib/person-name";
import { openSlotsOf } from "~/types/domain";

export type ParsedPlaytomicPaste = {
  clubQuery: string;
  city?: string;
  weekday?: ReturnType<typeof parseDutchWeekdayToken>;
  day?: number;
  hour: number;
  minute: number;
  durationMinutes: number;
  confirmedPlayerNames: string[];
  playtomicUrl?: string;
};

export type PlaytomicPrefillResult = {
  applied: boolean;
  draftId?: string;
  openSlots?: number;
  confirmedSlotNames?: string[];
  clubResolved?: boolean;
  clubName?: string;
  matchPageUrl?: string | null;
  /** Card overview of the draft configuration. */
  overviewUrl?: string | null;
  needsClubChoice?: boolean;
  clubCandidates?: { id: string; name: string; city: string }[];
};

const WEEKDAY_LINE =
  /📅\s*([a-zA-Zàáâãäåèéêëìíîïòóôõöùúûüçñ]+)\s+(\d{1,2})\s*,\s*(\d{1,2}):(\d{2})/i;
const DURATION_LINE = /\((\d{1,3})\s*min\)/i;
const CLUB_LINE = /\*?\s*WEDSTRIJD\s+IN\s+([^\n]+)/i;
const CITY_LINE = /📍\s*(.+)/;
const PLAYER_LINE = /^\s*✅\s*(.+?)(?:\s*\([^)]*\))?\s*$/gm;
const PLAYTOMIC_URL = /https?:\/\/(?:app\.|www\.)?playtomic\.io\/\S+/i;

/** Parse a pasted Playtomic match invitation (WhatsApp share text). */
export function parsePlaytomicPaste(body: string): ParsedPlaytomicPaste | null {
  const text = body.trim();
  if (!text) return null;

  const hasSignal =
    PLAYTOMIC_URL.test(text) ||
    /WEDSTRIJD\s+IN/i.test(text) ||
    (text.includes("📅") && text.includes("📍"));
  if (!hasSignal) return null;

  const clubMatch = text.match(CLUB_LINE);
  const dateMatch = text.match(WEEKDAY_LINE);
  if (!clubMatch || !dateMatch) return null;

  const clubQuery = clubMatch[1]!.replace(/\*+$/g, "").trim();
  const weekday = parseDutchWeekdayToken(dateMatch[1]!);
  const day = Number.parseInt(dateMatch[2]!, 10);
  const hour = Number.parseInt(dateMatch[3]!, 10);
  const minute = Number.parseInt(dateMatch[4]!, 10);
  if (!Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  const durationMatch = text.match(DURATION_LINE);
  const durationMinutes = durationMatch
    ? Number.parseInt(durationMatch[1]!, 10)
    : 90;

  const cityMatch = text.match(CITY_LINE);
  const city = cityMatch?.[1]?.trim();

  const confirmedPlayerNames: string[] = [];
  for (const match of text.matchAll(PLAYER_LINE)) {
    const name = match[1]?.trim();
    if (name && !/^\?+$/.test(name)) {
      confirmedPlayerNames.push(name);
    }
  }

  const urlMatch = text.match(PLAYTOMIC_URL);

  return {
    clubQuery,
    city,
    weekday,
    day,
    hour,
    minute,
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 90,
    confirmedPlayerNames,
    playtomicUrl: urlMatch?.[0],
  };
}

/**
 * Parse a Playtomic paste and upsert the user's draft match (club, time, ✅ spelers).
 * Powers the match wizard link (`/match/nieuw/:token`) prefill on the spelers step.
 */
export async function applyPlaytomicPasteToDraft(
  userId: string,
  body: string,
  options: { appOrigin?: string } = {},
): Promise<PlaytomicPrefillResult> {
  const parsed = parsePlaytomicPaste(body);
  if (!parsed) return { applied: false };

  const user = await findUserById(userId);
  if (!user) return { applied: false };

  const draft = await findOrCreateDraftMatch(userId);

  let scheduledAt: string | undefined;
  try {
    const dt = parseDutchDateTime({
      weekday: parsed.weekday,
      day: parsed.day,
      hour: parsed.hour,
      minute: parsed.minute,
    });
    scheduledAt = dt.iso;
  } catch {
    return { applied: false };
  }

  const clubs = await searchClubs(parsed.clubQuery);
  let clubId: string | undefined;
  let clubName: string | undefined;
  let needsClubChoice = false;
  let clubCandidates: PlaytomicPrefillResult["clubCandidates"];

  if (clubs.length === 1) {
    clubId = clubs[0]!.id;
    clubName = clubs[0]!.name;
    await addPlaytomicAlias(clubId, parsed.clubQuery);
  } else if (clubs.length > 1) {
    const cityNorm = parsed.city?.trim().toLowerCase();
    const byCity = cityNorm
      ? clubs.filter((c) => c.city.toLowerCase().includes(cityNorm))
      : [];
    if (byCity.length === 1) {
      clubId = byCity[0]!.id;
      clubName = byCity[0]!.name;
      await addPlaytomicAlias(clubId, parsed.clubQuery);
    } else {
      needsClubChoice = true;
      clubCandidates = clubs.slice(0, 3).map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city,
      }));
    }
  }

  const confirmedSlotNames = parsed.confirmedPlayerNames;
  const totalSlots = 4;
  const players = await getMatchPickerPlayers(userId);
  const organizerName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: "Organisator",
  });
  const onCourtRefs = playerRefsOnCourtFromRoster({
    organizerName,
    confirmedSlotNames,
    players,
  });
  const invitedFriendRefs = filterInvitableFriendRefs(
    user.favoritePlayerRefs,
    onCourtRefs,
  );

  const updated = await updateMatchDraft(draft.id, {
    ...(clubId ? { clubIds: [clubId] } : {}),
    scheduledAt,
    durationMinutes: parsed.durationMinutes,
    format: "mixed",
    totalSlots,
    confirmedSlotNames,
    invitedFriendRefs,
  });

  const appOrigin = options.appOrigin?.replace(/\/$/, "") ?? "";
  const originRequest = appOrigin ? new Request(`${appOrigin}/`) : null;
  const matchPageUrl = originRequest
    ? buildNewMatchPageUrl(originRequest, user.manageToken)
    : null;
  const overviewUrl = originRequest
    ? buildDraftMatchOverviewUrl(originRequest, user.manageToken)
    : null;

  return {
    applied: true,
    draftId: draft.id,
    openSlots: openSlotsOf(updated),
    confirmedSlotNames,
    clubResolved: Boolean(clubId),
    clubName,
    matchPageUrl,
    overviewUrl,
    needsClubChoice,
    clubCandidates,
  };
}

/** WhatsApp reply when the club from the paste is ambiguous. */
export function formatPlaytomicClubChoiceMessage(
  candidates: { id: string; name: string; city: string }[],
): string {
  const lines = candidates.map(
    (c, i) => `${String.fromCharCode(65 + i)}) ${c.name} · ${c.city}`,
  );
  return [
    "Ik kon de club niet exact herkennen. Welke bedoel je?",
    "",
    ...lines,
    "",
    "Antwoord met A, B of C.",
  ].join("\n");
}

/** Short summary after a successful deterministic prefill (before cascade question). */
export function formatPlaytomicPrefillSummary(
  prefill: PlaytomicPrefillResult & { applied: true },
  scheduledAtIso: string,
): string {
  const when = formatScheduledAt(scheduledAtIso);
  const players = prefill.confirmedSlotNames?.join(", ") ?? "—";
  const open = prefill.openSlots ?? 0;
  const club = prefill.clubName ?? "club nog te bevestigen";
  return [
    `Draft klaar: ${club}, ${when}, mixed (m/v).`,
    `Op de baan: ${players}.`,
    `${open} open ${open === 1 ? "plek" : "plekken"}.`,
    prefill.overviewUrl
      ? `Overzicht: ${prefill.overviewUrl}`
      : prefill.matchPageUrl
        ? `Link: ${prefill.matchPageUrl}`
        : "",
  ]
    .filter(Boolean)
    .join("\n");
}
