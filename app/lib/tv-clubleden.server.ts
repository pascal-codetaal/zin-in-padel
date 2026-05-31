/**
 * Public TV club member roster HTML (clubdashboard/clubleden).
 * `clubId` in the URL is TV's internal club id (padelstats `id`), not the matricule in data/clubs.json.
 */

import {
  catalogClubToTvClub,
  type CatalogClub,
} from "~/lib/clubs-catalog.server";
import {
  matchPadelstatsClub,
  padelstatsSearchTermFromClubName,
  searchPadelstatsClubs,
  type PadelstatsClubHit,
} from "~/lib/padelstats-api.server";

const TV_CLUBLEDEN_BASE =
  process.env.TV_CLUBLEDEN_BASE?.trim() ||
  "https://www.tennisenpadelvlaanderen.be/clubdashboard/clubleden";

const DEFAULT_USER_AGENT =
  process.env.TV_CLUBLEDEN_USER_AGENT?.trim() ||
  "Mozilla/5.0 (compatible; zin-in-padel/1.0; +https://github.com/codetaal/zin-in-padel)";

/** One row from the clubleden table. Names are "Achternaam Voornaam" as on TV. */
export type TvClubledenMember = {
  tvUserId: number;
  displayName: string;
  tennisSingles: string | null;
  tennisDoubles: string | null;
  padelRanking: string | null;
  gender: string | null;
};

export type TvClubledenParseResult = {
  clubName: string | null;
  reportedCount: number | null;
  members: TvClubledenMember[];
};

export type TvClubIdResolution = {
  tvClubId: number | null;
  padelstatsSearch: string;
  padelstatsClub: PadelstatsClubHit | null;
  error?: string;
};

const MEMBER_ROW_RE =
  /<a href="\/dashboard\?userId=(\d+)">([^<]+)<\/a>\s*<\/td>[\s\S]*?<td[^>]*data-title="Tennis enkel"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*data-title="Tennis dubbel"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*data-title="Padel"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*data-title="Geslacht"[^>]*>([\s\S]*?)<\/td>/gi;

function stripHtml(cell: string): string {
  return cell
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyToNull(value: string): string | null {
  const t = value.trim();
  if (!t || t === "—" || t === "-") return null;
  return t;
}

export function parseTvClubledenHtml(html: string): TvClubledenParseResult {
  const countMatch = html.match(/(\d+)\s+gevonden clubleden/i);
  const reportedCount = countMatch ? Number.parseInt(countMatch[1]!, 10) : null;

  const clubNameMatch = html.match(
    /<h1[^>]*>\s*([^<]+?)\s*-\s*clubleden/i,
  );
  const clubName = clubNameMatch?.[1]?.trim() ?? null;

  const members: TvClubledenMember[] = [];
  const seen = new Set<number>();

  for (const match of html.matchAll(MEMBER_ROW_RE)) {
    const tvUserId = Number.parseInt(match[1]!, 10);
    if (!Number.isFinite(tvUserId) || seen.has(tvUserId)) continue;
    seen.add(tvUserId);

    members.push({
      tvUserId,
      displayName: stripHtml(match[2]!),
      tennisSingles: emptyToNull(stripHtml(match[3]!)),
      tennisDoubles: emptyToNull(stripHtml(match[4]!)),
      padelRanking: emptyToNull(stripHtml(match[5]!)),
      gender: emptyToNull(stripHtml(match[6]!)),
    });
  }

  return { clubName, reportedCount, members };
}

export function filterTvClubledenPadelPlayers(
  members: TvClubledenMember[],
): TvClubledenMember[] {
  return members.filter((m) => m.padelRanking != null && /^P/i.test(m.padelRanking));
}

export async function resolveTvClubDashboardId(
  catalogClub: CatalogClub,
  tvClubIdOverride?: number | null,
): Promise<TvClubIdResolution> {
  const padelstatsSearch = padelstatsSearchTermFromClubName(catalogClub.name);
  const result: TvClubIdResolution = {
    tvClubId: null,
    padelstatsSearch,
    padelstatsClub: null,
  };

  if (tvClubIdOverride != null && Number.isFinite(tvClubIdOverride)) {
    result.tvClubId = Math.floor(tvClubIdOverride);
    return result;
  }

  try {
    const candidates = await searchPadelstatsClubs(padelstatsSearch);
    const matched = matchPadelstatsClub(
      catalogClubToTvClub(catalogClub),
      candidates,
    );
    if (!matched) {
      result.error = "no padelstats match for TV clubId";
      return result;
    }
    result.padelstatsClub = matched;
    result.tvClubId = matched.id;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchTvClubledenHtml(
  tvClubId: number,
  options?: { retries?: number },
): Promise<string> {
  const url = new URL(TV_CLUBLEDEN_BASE);
  url.searchParams.set("clubId", String(tvClubId));
  const maxAttempts = Math.max(1, options?.retries ?? 4);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });

    const text = await res.text();
    if (res.ok) return text;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(
        `TV clubleden ${tvClubId}: HTTP ${res.status} — ${text.slice(0, 120)}`,
      );
    }

    const backoffMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
    await sleep(backoffMs);
  }

  throw new Error(`TV clubleden ${tvClubId}: fetch failed`);
}

export async function fetchTvClubledenRoster(
  tvClubId: number,
  options?: { padelOnly?: boolean },
): Promise<TvClubledenParseResult> {
  const html = await fetchTvClubledenHtml(tvClubId);
  const parsed = parseTvClubledenHtml(html);
  if (options?.padelOnly) {
    return {
      ...parsed,
      members: filterTvClubledenPadelPlayers(parsed.members),
    };
  }
  return parsed;
}
