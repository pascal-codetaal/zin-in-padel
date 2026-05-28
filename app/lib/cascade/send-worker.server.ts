/**
 * pgmq drain loop for the `invite-sends` queue.
 *
 * The Supabase cron row hits `/api/cron/send-tick`, which calls this. We
 * read a small batch with a short visibility timeout, send each via Twilio
 * (real or mock), then either delete (success) or archive (terminal skip /
 * retry exhaustion) the message. Transient failures are left in-place so
 * pgmq re-delivers them after the VT expires.
 */

import { isInviteQueueEnabled, readInviteSendBatch, deleteInviteSend, archiveInviteSend, type InviteSendMessage } from "./queue.server";
import { sendInviteByToken, type SendInviteOutcome } from "./send.server";

export type SendTickTrace = {
  ranAt: string;
  queueEnabled: boolean;
  processed: number;
  perMessage: Array<{
    msgId: string;
    inviteToken: string;
    readCt: number;
    outcome: SendInviteOutcome;
    action: "deleted" | "archived" | "left-for-retry";
  }>;
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_VT_SECONDS = 60;
const MAX_ATTEMPTS = 5;

export type RunSendTickOptions = {
  batchSize?: number;
  vtSeconds?: number;
  maxAttempts?: number;
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
  const vtSeconds = options.vtSeconds ?? DEFAULT_VT_SECONDS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;

  const messages = await readInviteSendBatch({ qty: batchSize, vtSeconds });

  for (const msg of messages) {
    const outcome = await handleOne(msg, now);
    let action: "deleted" | "archived" | "left-for-retry";

    if (outcome.kind === "sent" || outcome.kind === "skipped") {
      // Terminal: stop redelivery. Skipped = permanent reason (already-sent,
      // user-opted-out, etc.) — no point retrying.
      await deleteInviteSend(msg.msgId);
      action = "deleted";
    } else if (msg.readCt >= maxAttempts) {
      // Failed too many times — archive to keep the dead letter out of the
      // active queue. The `MatchInvitedPlayer.sendError` field has the last
      // error and the organiser UI surfaces it.
      await archiveInviteSend(msg.msgId);
      action = "archived";
    } else {
      // Transient failure: leave the message; pgmq makes it visible again
      // when the VT expires.
      action = "left-for-retry";
    }

    trace.processed += 1;
    trace.perMessage.push({
      msgId: msg.msgId.toString(),
      inviteToken: msg.payload.inviteToken,
      readCt: msg.readCt,
      outcome,
      action,
    });
  }

  return trace;
}

async function handleOne(
  msg: InviteSendMessage,
  now: Date,
): Promise<SendInviteOutcome> {
  try {
    return await sendInviteByToken(msg.payload.inviteToken, now, {
      deliverViaApi: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "failed", error: message };
  }
}
