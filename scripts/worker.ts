import { config as loadDotenv } from "dotenv";
// `tsx` does not automatically load `.env` like Vite/React Router dev do.
// Load `.env` first, then allow `.env.local` to override when present.
loadDotenv({ path: ".env" });

import { Worker } from "bullmq";
import {
  getCascadePhaseEventQueue,
  getInviteSendQueue,
  isInviteQueueEnabled,
  type CascadePhaseEventPayload,
  type InviteSendPayload,
} from "../app/lib/cascade/queue.server";
import { sendInviteByToken } from "../app/lib/cascade/send.server";
import { runCascadeTickForMatch } from "../app/lib/cascade/runner.server";


async function main() {
  if (!isInviteQueueEnabled()) {
    console.error(
      "Worker not started: set INVITE_QUEUE_ENABLED=true and Redis URL env.",
    );
    process.exit(1);
  }

  const sendQueue = getInviteSendQueue();
  const phaseQueue = getCascadePhaseEventQueue();
  const sendConcurrency = Number(process.env.SEND_WORKER_CONCURRENCY ?? "10");
  const phaseConcurrency = Number(process.env.PHASE_WORKER_CONCURRENCY ?? "5");

  const sendWorker = new Worker<InviteSendPayload>(
    sendQueue.name,
    async (job) => {
      const outcome = await sendInviteByToken(job.data.inviteToken, new Date(), {
        deliverViaApi: true,
      });
      if (outcome.kind === "failed") throw new Error(outcome.error);
      return outcome;
    },
    { connection: sendQueue.opts.connection, concurrency: sendConcurrency },
  );

  const phaseWorker = new Worker<CascadePhaseEventPayload>(
    phaseQueue.name,
    async (job) => {
      await runCascadeTickForMatch(job.data.matchId, new Date());
      return { ok: true };
    },
    { connection: phaseQueue.opts.connection, concurrency: phaseConcurrency },
  );

  sendWorker.on("failed", (job, err) => {
    console.error("Send worker failed", {
      jobId: job?.id ?? null,
      inviteToken: job?.data?.inviteToken ?? null,
      error: err.message,
    });
  });
  phaseWorker.on("failed", (job, err) => {
    console.error("Phase worker failed", {
      jobId: job?.id ?? null,
      matchId: job?.data?.matchId ?? null,
      phase: job?.data?.phase ?? null,
      error: err.message,
    });
  });

  console.log("Workers started", {
    sendQueue: sendQueue.name,
    phaseQueue: phaseQueue.name,
    sendConcurrency,
    phaseConcurrency,
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down workers...`);
    await Promise.allSettled([
      sendWorker.close(),
      phaseWorker.close(),
      sendQueue.close(),
      phaseQueue.close(),
    ]);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
