/**
 * localtunnel shows a "Friendly Reminder" interstitial for browser fetch/XHR.
 * React Router form actions use fetch, so redirects never run unless we bypass it.
 * @see https://github.com/localtunnel/localtunnel/issues/366
 */
export function installLocaltunnelFetchBypass(): void {
  if (typeof window === "undefined") return;
  if (!window.location.hostname.endsWith(".loca.lt")) return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request) {
      const headers = new Headers(input.headers);
      headers.set("Bypass-Tunnel-Reminder", "true");
      return nativeFetch(new Request(input, { headers }));
    }

    const headers = new Headers(init?.headers);
    headers.set("Bypass-Tunnel-Reminder", "true");
    return nativeFetch(input, { ...init, headers });
  };
}
