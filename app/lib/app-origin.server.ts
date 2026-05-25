/** Fallback when requestContext / webhook origin is missing (bv. Mastra Studio). */
export const DEFAULT_APP_ORIGIN = "http://localhost:5173";

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

/** Resolve site origin: requestContext → APP_ORIGIN env → localhost default. */
export function resolveAppOrigin(context?: {
  requestContext?: { get(key: string): unknown } | null;
}): string {
  const fromContext = context?.requestContext?.get("appOrigin");
  if (typeof fromContext === "string" && fromContext.trim()) {
    return normalizeOrigin(fromContext);
  }
  const fromEnv = process.env.APP_ORIGIN?.trim();
  if (fromEnv) return normalizeOrigin(fromEnv);
  return DEFAULT_APP_ORIGIN;
}

/** Webhook/simulator path: prefer inbound request origin, else shared fallback. */
export function resolveAppOriginFromRequest(
  requestOrigin?: string,
): string {
  if (requestOrigin?.trim()) return normalizeOrigin(requestOrigin);
  return resolveAppOrigin();
}
