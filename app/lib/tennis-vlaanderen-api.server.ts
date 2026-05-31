/**
 * Tennis & Padel Vlaanderen padel API (padel-webapi.tppwb.be).
 * Documented at http://padel-webapi.tppwb.be/Help — requires client_id + client_secret.
 * Bulk club rosters use tv-clubleden.server.ts (public clubdashboard HTML); player search
 * should use this API when credentials are available.
 */

const API_BASE =
  process.env.TENNIS_VLAANDEREN_API_BASE?.trim() ||
  "http://padel-webapi.tppwb.be";

export type TvPlayerSearchResult = {
  memberId: string;
  numFed: string;
  firstName: string;
  lastName: string;
  padelRanking: string | null;
  label: string;
};

/** Club row from GET api/Clubs/GetAllClubs (and related endpoints). */
export type TvClub = {
  clubId: string;
  name: string;
  city: string;
  /** TV matricule / club number — matches padelstats CLUBNR when present. */
  clubNumber: string | null;
};

type TvApiPlayerRow = {
  MembreID?: number | string;
  NumFed?: string;
  Prenom?: string;
  Nom?: string;
  ClasmtDouble?: string | null;
};

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export function isTennisVlaanderenApiConfigured(): boolean {
  return Boolean(
    process.env.TENNIS_VLAANDEREN_API_CLIENT_ID?.trim() &&
      process.env.TENNIS_VLAANDEREN_API_CLIENT_SECRET?.trim(),
  );
}

function parseTokenPayload(body: unknown): { token: string; expiresInSec: number } {
  if (typeof body === "string" && body.length > 10 && !body.includes("Invalid")) {
    return { token: body, expiresInSec: 3600 };
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const token =
      (typeof o.access_token === "string" && o.access_token) ||
      (typeof o.token === "string" && o.token) ||
      (typeof o.Token === "string" && o.Token) ||
      "";
    const expiresIn =
      typeof o.expires_in === "number"
        ? o.expires_in
        : typeof o.expiresIn === "number"
          ? o.expiresIn
          : 3600;
    if (token) return { token, expiresInSec: expiresIn };
  }
  throw new Error("Unexpected Tennis Vlaanderen token response");
}

async function getApiToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const clientId = process.env.TENNIS_VLAANDEREN_API_CLIENT_ID?.trim();
  const clientSecret = process.env.TENNIS_VLAANDEREN_API_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Tennis Vlaanderen API credentials not configured");
  }

  const res = await fetch(`${API_BASE}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    /* plain string token */
  }

  if (!res.ok) {
    throw new Error(
      typeof body === "string" ? body : "Tennis Vlaanderen authentication failed",
    );
  }

  const { token, expiresInSec } = parseTokenPayload(body);
  tokenCache = {
    token,
    expiresAt: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
  };
  return token;
}

function normalizePlayerRows(body: unknown): TvApiPlayerRow[] {
  if (Array.isArray(body)) return body as TvApiPlayerRow[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const nested =
      o.AFT_sp_SearchPlayerForAutoCompleteResult ??
      o.results ??
      o.Results;
    if (Array.isArray(nested)) return nested as TvApiPlayerRow[];
    if (nested && typeof nested === "object") return [nested as TvApiPlayerRow];
  }
  return [];
}

function playerLabel(row: TvApiPlayerRow): string {
  const first = row.Prenom?.trim() ?? "";
  const last = row.Nom?.trim() ?? "";
  const numFed = row.NumFed?.trim() ?? "";
  const rank = row.ClasmtDouble?.trim();
  const name = [first, last].filter(Boolean).join(" ");
  const parts = [name, numFed ? `nr. ${numFed}` : "", rank ? `P${rank.replace(/^P/i, "")}` : ""]
    .filter(Boolean);
  return parts.join(" · ");
}

function rowToResult(row: TvApiPlayerRow): TvPlayerSearchResult | null {
  const numFed = row.NumFed?.trim();
  if (!numFed) return null;
  const memberId =
    row.MembreID !== undefined && row.MembreID !== null
      ? String(row.MembreID)
      : "";
  const firstName = row.Prenom?.trim() ?? "";
  const lastName = row.Nom?.trim() ?? "";
  const padelRanking = row.ClasmtDouble?.trim() || null;
  return {
    memberId,
    numFed,
    firstName,
    lastName,
    padelRanking,
    label: playerLabel(row),
  };
}

export async function searchTennisVlaanderenPlayers(
  query: string,
): Promise<TvPlayerSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const token = await getApiToken();
  const isNumFed = /^\d{5,}$/.test(q.replace(/\s/g, ""));
  const url = new URL(
    `${API_BASE}/api/Players/SearchPlayerForAutoComplete`,
  );
  url.searchParams.set("searchText", q);
  url.searchParams.set("isNumFed", String(isNumFed));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      text.slice(0, 200) || "Tennis Vlaanderen player search failed",
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const results: TvPlayerSearchResult[] = [];
  for (const row of normalizePlayerRows(body)) {
    const mapped = rowToResult(row);
    if (!mapped || seen.has(mapped.numFed)) continue;
    seen.add(mapped.numFed);
    results.push(mapped);
    if (results.length >= 12) break;
  }
  return results;
}

type TvApiClubRow = {
  ClubID?: number | string;
  Name?: string;
  Nom?: string;
  City?: string;
  Localite?: string;
  Ville?: string;
  Matricule?: number | string;
  NumClub?: number | string;
  ClubNr?: number | string;
  NumeroClub?: number | string;
};

function normalizeClubRows(body: unknown): TvApiClubRow[] {
  if (Array.isArray(body)) return body as TvApiClubRow[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const nested =
      o.AFT_sp_GetAllClubsResult ??
      o.AFT_sp_Get_All_ClubsResult ??
      o.results ??
      o.Results ??
      o.Clubs;
    if (Array.isArray(nested)) return nested as TvApiClubRow[];
    if (nested && typeof nested === "object") return [nested as TvApiClubRow];
  }
  return [];
}

function rowToTvClub(row: TvApiClubRow): TvClub | null {
  const clubIdRaw = row.ClubID;
  if (clubIdRaw === undefined || clubIdRaw === null || clubIdRaw === "") {
    return null;
  }
  const name = (row.Name ?? row.Nom)?.trim();
  if (!name) return null;
  const city = (row.City ?? row.Localite ?? row.Ville)?.trim() ?? "";
  const clubNumberRaw =
    row.Matricule ?? row.NumClub ?? row.ClubNr ?? row.NumeroClub;
  const clubNumber =
    clubNumberRaw !== undefined && clubNumberRaw !== null
      ? String(clubNumberRaw).trim()
      : null;
  return {
    clubId: String(clubIdRaw).trim(),
    name,
    city,
    clubNumber: clubNumber || null,
  };
}

/** All padel clubs from Tennis & Padel Vlaanderen (requires API credentials). */
export async function getAllTennisVlaanderenClubs(): Promise<TvClub[]> {
  const token = await getApiToken();
  const res = await fetch(`${API_BASE}/api/Clubs/GetAllClubs`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      text.slice(0, 200) || "Tennis Vlaanderen GetAllClubs failed",
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const clubs: TvClub[] = [];
  for (const row of normalizeClubRows(body)) {
    const mapped = rowToTvClub(row);
    if (!mapped || seen.has(mapped.clubId)) continue;
    seen.add(mapped.clubId);
    clubs.push(mapped);
  }
  return clubs;
}
