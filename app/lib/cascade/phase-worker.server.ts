import { Worker } from "bullmq";
import {
  getCascadePhaseEventQueue,
  isInviteQueueEnabled,
  type CascadePhaseEventPayload,
} from "./queue.server";
import { runCascadeTickForMatch } from "./runner.server";

const DEFAULT_BATCH_SIZE = 10;

export type CascadeEventTickTrace = {
  ranAt: string;
  queueEnabled: boolean;
  processed: number;
  perEvent: Array<{
    msgId: string | null;
    matchId: string;
    phase: 2 | 3;
    action: "completed" | "failed";
    error?: string;
  }>;
};

export async function runCascadeEventTick(
  now: Date,
  options: { batchSize?: number } = {},
): Promise<CascadeEventTickTrace> {
  const trace: CascadeEventTickTrace = {
    ranAt: now.toISOString(),
    queueEnabled: isInviteQueueEnabled(),
    processed: 0,
    perEvent: [],
  };
  if (!trace.queueEnabled) return trace;

  const queue = getCascadePhaseEventQueue();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const { waiting = 0, delayed = 0 } = await queue.getJobCounts(
    "waiting",
    "delayed",
  );
  if (waiting + delayed === 0) return trace;

  const worker = new Worker<CascadePhaseEventPayload>(
    queue.name,
    async (job) => {
      await runCascadeTickForMatch(job.data.matchId, now);
      trace.processed += 1;
      trace.perEvent.push({
        msgId: String(job.id),
        matchId: job.data.matchId,
        phase: job.data.phase,
        action: "completed",
      });
    },
    { connection: queue.opts.connection, concurrency: batchSize },
  );

  worker.on("failed", (job, error) => {
    trace.processed += 1;
    trace.perEvent.push({
      msgId: job?.id ? String(job.id) : null,
      matchId: job?.data?.matchId ?? "unknown",
      phase: (job?.data?.phase ?? 2) as 2 | 3,
      action: "failed",
      error: error.message,
    });
  });

  for (let i = 0; i < 10; i += 1) {
    const counts = await queue.getJobCounts("waiting", "active", "delayed");
    if (counts.waiting === 0 && counts.active === 0) break;
    await sleep(500);
  }
  await worker.close();
  return trace;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
