import { Queue } from "bullmq";

export const INVITE_SEND_QUEUE = "invite-sends";
export const CASCADE_PHASE_EVENT_QUEUE = "cascade-phase-events";

export type InviteSendPayload = {
  inviteToken: string;
  matchId: string;
  phase: 1 | 2 | 3;
};

export type CascadePhaseEventPayload = {
  matchId: string;
  phase: 2 | 3;
};

export function isInviteQueueEnabled(): boolean {
  return (
    process.env.INVITE_QUEUE_ENABLED === "true" &&
    getRedisConnection() !== null
  );
}

export type EnqueueInviteSendOptions = {
  delayMs?: number;
};

export async function enqueueInviteSend(
  payload: InviteSendPayload,
  options: EnqueueInviteSendOptions = {},
): Promise<string | null> {
  if (!isInviteQueueEnabled()) return null;
  const queue = getInviteSendQueue();
  const delay = Math.max(0, options.delayMs ?? 0);
  const jobId = buildInviteSendJobId(payload);

  const job = await queue.add("send-invite", payload, {
    jobId,
    delay,
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: true,
  });

  return String(job.id);
}

export async function cancelInviteSendsForMatch(matchId: string): Promise<number> {
  if (!isInviteQueueEnabled()) return 0;
  const queues = [getInviteSendQueue(), getCascadePhaseEventQueue()];
  const prefix = `match|${matchId}|`;
  let cancelled = 0;

  for (const queue of queues) {
    let start = 0;
    const pageSize = 250;
    while (true) {
      const jobs = await queue.getJobs(
        ["delayed", "waiting", "prioritized", "paused", "waiting-children"],
        start,
        start + pageSize - 1,
        true,
      );
      if (jobs.length === 0) break;

      for (const job of jobs) {
        if (String(job.id).startsWith(prefix)) {
          await job.remove();
          cancelled += 1;
        }
      }
      if (jobs.length < pageSize) break;
      start += pageSize;
    }
  }

  return cancelled;
}

export function getInviteSendQueue(): Queue<InviteSendPayload> {
  const connection = getRedisConnection();
  if (!connection) {
    throw new Error("INVITE_QUEUE_ENABLED=true but no Redis connection configured.");
  }
  return new Queue<InviteSendPayload>(INVITE_SEND_QUEUE, { connection });
}

export function getCascadePhaseEventQueue(): Queue<CascadePhaseEventPayload> {
  const connection = getRedisConnection();
  if (!connection) {
    throw new Error("INVITE_QUEUE_ENABLED=true but no Redis connection configured.");
  }
  return new Queue<CascadePhaseEventPayload>(CASCADE_PHASE_EVENT_QUEUE, {
    connection,
  });
}

export async function enqueueCascadePhaseEvent(args: {
  matchId: string;
  phase: 2 | 3;
  delayMs: number;
}): Promise<string | null> {
  if (!isInviteQueueEnabled()) return null;
  const queue = getCascadePhaseEventQueue();
  const delay = Math.max(0, args.delayMs);
  const job = await queue.add(
    "fire-cascade-phase",
    { matchId: args.matchId, phase: args.phase },
    {
      jobId: buildCascadePhaseJobId(args.matchId, args.phase),
      delay,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
  return String(job.id);
}

function buildInviteSendJobId(payload: InviteSendPayload): string {
  return `match|${payload.matchId}|invite|${payload.inviteToken}|phase|${payload.phase}`;
}

function buildCascadePhaseJobId(matchId: string, phase: 2 | 3): string {
  return `match|${matchId}|cascade-phase|${phase}`;
}

function getRedisConnection():
  | {
      host: string;
      port: number;
      username?: string;
      password?: string;
      tls?: Record<string, never>;
      maxRetriesPerRequest: null;
    }
  | null {
  const redisUrl =
    process.env.BULLMQ_REDIS_URL ??
    process.env.UPSTASH_REDIS_URL ??
    process.env.REDIS_URL;
  if (!redisUrl) return null;

  const parsed = new URL(redisUrl);
  const isTls = parsed.protocol === "rediss:";
  return {
    host: parsed.hostname,
    port: Number(parsed.port || (isTls ? "6380" : "6379")),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    tls: isTls ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
