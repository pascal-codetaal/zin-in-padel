import { Worker } from "bullmq";
import {
  getInviteSendQueue,
  isInviteQueueEnabled,
  type InviteSendPayload,
} from "./queue.server";
import { sendInviteByToken, type SendInviteOutcome } from "./send.server";

export type SendTickTrace = {
  ranAt: string;
  queueEnabled: boolean;
  processed: number;
  perMessage: Array<{
    msgId: string | null;
    inviteToken: string;
    attemptsMade: number;
    outcome: SendInviteOutcome;
    action: "completed" | "failed";
  }>;
};

const DEFAULT_BATCH_SIZE = 10;

export type RunSendTickOptions = {
  batchSize?: number;
};

export async function runSendTick(
  now: Date,
  options: RunSendTickOptions = {},
): Promise<SendTickTrace> {
  const trace: SendTickTrace = {
    ranAt: now.toISOString(),
    queueEnabled: isInviteQueueEnabled(),
    processed: 0,
    perMessage: [],
  };

  if (!trace.queueEnabled) return trace;

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const queue = getInviteSendQueue();
  const { waiting = 0, delayed = 0 } = await queue.getJobCounts(
    "waiting",
    "delayed",
  );
  if (waiting + delayed === 0) return trace;

  const worker = new Worker<InviteSendPayload>(
    queue.name,
    async (job) => {
      const outcome = await handleOne(job.data.inviteToken, now);
      if (outcome.kind === "failed") {
        throw new Error(outcome.error);
      }

      trace.processed += 1;
      trace.perMessage.push({
        msgId: String(job.id),
        inviteToken: job.data.inviteToken,
        attemptsMade: job.attemptsMade,
        outcome,
        action: "completed",
      });
      return outcome;
    },
    { connection: queue.opts.connection, concurrency: batchSize },
  );

  worker.on("failed", (job, error) => {
    const inviteToken = job?.data?.inviteToken ?? "unknown";
    const attemptsMade = job?.attemptsMade ?? 0;
    trace.processed += 1;
    trace.perMessage.push({
      msgId: job?.id ? String(job.id) : null,
      inviteToken,
      attemptsMade,
      outcome: { kind: "failed", error: error.message },
      action: "failed",
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

async function handleOne(token: string, now: Date): Promise<SendInviteOutcome> {
  try {
    return await sendInviteByToken(token, now, {
      deliverViaApi: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "failed", error: message };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
