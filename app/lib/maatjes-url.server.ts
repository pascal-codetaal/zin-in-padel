/** Opaque token in `/maatjes/:token` — one personal manage link per user. */
export function createManageToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function buildMaatjesPageUrl(request: Request, manageToken: string): string {
  const url = new URL(request.url);
  return `${url.origin}/maatjes/${manageToken}`;
}

export function buildProfielPageUrl(request: Request, manageToken: string): string {
  const url = new URL(request.url);
  return `${url.origin}/profiel/${manageToken}`;
}

export function buildNewMatchPageUrl(request: Request, manageToken: string): string {
  const url = new URL(request.url);
  return `${url.origin}/match/nieuw/${manageToken}`;
}

/** Card-style draft overview (spelers, cascade, club, …). */
export function buildDraftMatchOverviewUrl(
  request: Request,
  manageToken: string,
): string {
  const url = new URL(request.url);
  return `${url.origin}/match/nieuw/${manageToken}/overzicht`;
}

/** Live match list for the organiser (after finalize). */
export function buildMatchListUrl(request: Request, manageToken: string): string {
  const url = new URL(request.url);
  return `${url.origin}/match/${manageToken}`;
}
