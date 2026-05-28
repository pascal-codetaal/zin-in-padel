import { config as loadDotenv } from "dotenv";
// `tsx` does not automatically load `.env` like Vite/React Router dev do.
// Load `.env` first, then allow `.env.local` to override when present.
loadDotenv({ path: ".env" });

/**
 * Resolve a Postgres URL for runtime (Prisma, Mastra, serverless).
 *
 * Supabase direct hosts (`db.<ref>.supabase.co`) are often IPv6-only and fail on
 * Vercel with `getaddrinfo ENOTFOUND`. Use the pooler host from your dashboard
 * (e.g. `aws-0-eu-west-3.pooler.supabase.com` — region is project-specific).
 * Pooler username must be `postgres.<project-ref>`, not `postgres`.
 */
export function resolveRuntimePostgresUrl(
  override?: string,
): string {
  const candidates = [override, process.env.DATABASE_URL, process.env.DIRECT_URL]
    .map((u) => u?.trim())
    .filter((u): u is string => Boolean(u));
  
  if (candidates.length === 0) {
    throw new Error(
      "Set DATABASE_URL to your Supabase connection pooler URL (port 6543, ?pgbouncer=true).",
    );
  }

  const pooler = candidates.find((u) => u.includes("pooler.supabase.com"));
  if (pooler) return pooler;

  const direct = candidates.find((u) => /db\.[a-z0-9]+\.supabase\.co/i.test(u));
  if (direct && process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL points at db.*.supabase.co, which does not resolve on Vercel (IPv6-only). " +
        "Use the Supabase transaction pooler URL for DATABASE_URL, or set DIRECT_URL to the pooler and swap.",
    );
  }

  return candidates[0];
}
