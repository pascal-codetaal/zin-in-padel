/**
 * Legacy scan endpoint for the cascade scheduler. Optional safety net — the
 * primary driver is now the BullMQ `cascade-phase-events` worker (ADR-0005),
 * which fires delayed per-match jobs. This endpoint still works: it advances
 * every match whose `nextCascadeAt <= now` by one phase and dispatches (or
 * enqueues) the resulting phase-2/3 invites. Idempotent job IDs make a
 * redundant scan safe.
 *
 * If still wired, a Supabase `cron.schedule` row POSTs this URL with
 * `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Auth contract:
 *   - Production: `CRON_SECRET` env required. Requests must match.
 *   - Dev: when `NODE_ENV !== 'production'` AND `CRON_SECRET` is unset,
 *     allow unauthenticated calls so `/dev/cron-tick` can drive a tick.
 */

import type { Route } from "./+types/api.cron.cascade-tick";
import { runCascadeTick, type TickTrace } from "~/lib/cascade/runner.server";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
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

  const url = new URL(request.url);
  const atParam = url.searchParams.get("at");
  const now = atParam ? new Date(atParam) : new Date();
  if (Number.isNaN(now.getTime())) {
    return Response.json({ error: `invalid ?at=${atParam}` }, { status: 400 });
  }

  const trace: TickTrace = await runCascadeTick(now);
  return Response.json(trace);
}

export async function loader({ request }: Route.LoaderArgs) {
  return handle(request);
}

export async function action({ request }: Route.ActionArgs) {
  return handle(request);
}
