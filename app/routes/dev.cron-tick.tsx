/**
 * Dev-only manual cron tick. Simulates one beat of the cascade scheduler
 * without depending on pg_cron firing locally.
 *
 * Usage:
 *   POST /dev/cron-tick           — uses real wall clock
 *   POST /dev/cron-tick?at=ISO    — uses injected `now` (for time-travel tests)
 *   GET  /dev/cron-tick           — returns JSON trace + a small HTML form
 *
 * Mounted with React Router file-based routing (`dev.cron-tick.tsx` → /dev/cron-tick).
 * 404s in production.
 */

import type { Route } from "./+types/dev.cron-tick";
import { assertDevOnly } from "~/lib/dev-guard.server";
import { runCascadeTick, type TickTrace } from "~/lib/cascade/runner.server";

async function tick(request: Request): Promise<TickTrace> {
  const url = new URL(request.url);
  const atParam = url.searchParams.get("at");
  const now = atParam ? new Date(atParam) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Response(`invalid ?at=${atParam}`, { status: 400 });
  }
  return runCascadeTick(now);
}

export async function loader({ request }: Route.LoaderArgs) {
  assertDevOnly();
  // GET returns last trace shape via a fresh tick so devs can poke from a
  // browser and see what just happened.
  const trace = await tick(request);
  return Response.json(trace);
}

export async function action({ request }: Route.ActionArgs) {
  assertDevOnly();
  const trace = await tick(request);
  return Response.json(trace);
}

export default function DevCronTick({ loaderData }: Route.ComponentProps) {
  const trace = loaderData as TickTrace;
  return (
    <main style={{ padding: 24, fontFamily: "ui-monospace, monospace" }}>
      <h1>Cascade cron tick</h1>
      <p>
        Ran at <code>{trace.ranAt}</code>. Considered{" "}
        <strong>{trace.matchesConsidered}</strong> due matches.
      </p>
      <pre>{JSON.stringify(trace, null, 2)}</pre>
      <form method="post">
        <button type="submit">Tick again (now)</button>
      </form>
    </main>
  );
}
