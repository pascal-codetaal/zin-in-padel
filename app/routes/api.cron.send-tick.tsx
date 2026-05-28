/**
 * Phase E.3 — Supabase cron drainer for the `invite-sends` pgmq queue.
 *
 * Triggered by a Supabase `cron.schedule` row that POSTs to this URL with
 * `Authorization: Bearer ${CRON_SECRET}`. Reads a batch of pgmq messages,
 * sends each invite via Twilio (real or mock), and ACKs / archives based
 * on outcome.
 *
 * Auth contract:
 *   - Production: `CRON_SECRET` env required. Requests must match.
 *   - Dev: when `NODE_ENV !== 'production'` AND `CRON_SECRET` is unset,
 *     allow unauthenticated calls so `/dev/cron-tick` can drive a tick.
 */

import type { Route } from "./+types/api.cron.send-tick";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured: only allow in non-production.
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header === expected;
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(
    {
      error: "deprecated",
      message:
        "send-tick is disabled. Use the dedicated Fly worker process instead.",
    },
    { status: 410 },
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  return handle(request);
}

export async function action({ request }: Route.ActionArgs) {
  return handle(request);
}
