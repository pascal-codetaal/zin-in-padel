/** Base URL for invite deep links in Twilio templates (Meta requires a stable sample host). */
export function resolveInviteTemplateBaseUrl(): string {
  return (
    process.env.BASE_URL ??
    process.env.APP_URL ??
    process.env.APP_ORIGIN ??
    "http://zin-in-padel.fly.dev"
  ).replace(/\/+$/, "");
}

/** Extract invite token from `/i/{token}` accept URL. */
export function inviteTokenFromAcceptUrl(acceptUrl: string): string {
  const match = acceptUrl.match(/\/i\/([^/?#]+)/);
  if (!match?.[1]) {
    throw new Error(`Cannot parse invite token from URL: ${acceptUrl}`);
  }
  return match[1];
}
