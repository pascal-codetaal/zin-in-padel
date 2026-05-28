/**
 * Dev-only manual cron tick. Simulates one beat of either the cascade
 * scheduler or the invite-send queue worker without depending on pg_cron
 * firing locally.
 *
 * Usage:
 *   POST /dev/cron-tick                       — cascade tick, real wall clock
 *   POST /dev/cron-tick?at=ISO                — cascade tick at injected `now`
 *   POST /dev/cron-tick?which=send            — send-queue tick (drains pgmq)
 *   POST /dev/cron-tick?which=send&at=ISO     — send-queue tick at injected `now`
 *   GET  /dev/cron-tick                       — JSON trace + form
 *
 * 404s in production.
 */

import type { Route } from "./+types/dev.cron-tick";
import { assertDevOnly } from "~/lib/dev-guard.server";
import { runCascadeTick, type TickTrace } from "~/lib/cascade/runner.server";
import { runSendTick, type SendTickTrace } from "~/lib/cascade/send-worker.server";

type DevTickResponse =
  | { which: "cascade"; trace: TickTrace }
  | { which: "send"; trace: SendTickTrace };

async function tick(request: Request): Promise<DevTickResponse> {
  const url = new URL(request.url);
  const atParam = url.searchParams.get("at");
  const which = url.searchParams.get("which") === "send" ? "send" : "cascade";
  const now = atParam ? new Date(atParam) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Response(`invalid ?at=${atParam}`, { status: 400 });
  }
  if (which === "send") {
    return { which, trace: await runSendTick(now) };
  }
  return { which, trace: await runCascadeTick(now) };
}

export async function loader({ request }: Route.LoaderArgs) {
  assertDevOnly();
  return Response.json(await tick(request));
}

export async function action({ request }: Route.ActionArgs) {
  assertDevOnly();
  return Response.json(await tick(request));
}

export default function DevCronTick({ loaderData }: Route.ComponentProps) {
  const data = loaderData as DevTickResponse;
  return (
    <main style={{ padding: 24, fontFamily: "ui-monospace, monospace" }}>
      <h1>Cron tick — {data.which}</h1>
      <p>
        Ran at <code>{data.trace.ranAt}</code>.
      </p>
      <pre>{JSON.stringify(data.trace, null, 2)}</pre>
      <form method="post" style={{ display: "inline-block", marginRight: 12 }}>
        <button type="submit">Tick cascade</button>
      </form>
      <form method="post" action="?which=send" style={{ display: "inline-block" }}>
        <button type="submit">Tick send-queue</button>
      </form>
    </main>
  );
}
