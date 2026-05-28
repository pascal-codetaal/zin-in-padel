/**
 * Phase E entry point: decide between the legacy synchronous mock dispatcher
 * (`dispatchPendingInvites`) and the pgmq enqueue path the cron worker drains.
 *
 * Callers (match finalize + cascade runner) call this single function; the
 * `INVITE_QUEUE_ENABLED` env flag flips behaviour. That way the queue can be
 * rolled out per-environment without touching the call sites.
 */

import { prisma } from "~/lib/prisma.server";
import { dispatchPendingInvites } from "./send.server";
import {
  enqueueInviteSend,
  isInviteQueueEnabled,
  type InviteSendPayload,
} from "./queue.server";

export type DispatchOrEnqueueResult =
  | { kind: "dispatched-inline"; sent: number; skipped: number }
  | { kind: "enqueued"; enqueued: number };

/**
 * Send every pending invite for `matchId` that has no `sentAt` yet.
 *
 * - When the queue is disabled: forwards to `dispatchPendingInvites`, which
 *   sends synchronously (mock mode → writes to inbox; real mode → would call
 *   Twilio inline, kept for backwards compat in tests + dev simulator).
 * - When the queue is enabled: inserts one pgmq message per pending invite.
 *   The `/api/cron/send-tick` handler drains the queue and calls Twilio.
 */
export async function dispatchOrEnqueueInvites(
  matchId: string,
  now: Date,
): Promise<DispatchOrEnqueueResult> {
  if (!isInviteQueueEnabled()) {
    const outcome = await dispatchPendingInvites(matchId, now);
    return {
      kind: "dispatched-inline",
      sent: outcome.sent,
      skipped: outcome.skipped.length,
    };
  }

  const pending = await prisma.matchInvitedPlayer.findMany({
    where: { matchId, sentAt: null, status: "pending" },
    select: { token: true, cascadePhase: true },
  });

  let enqueued = 0;
  for (const row of pending) {
    const payload: InviteSendPayload = {
      inviteToken: row.token,
      matchId,
      phase: row.cascadePhase as 1 | 2 | 3,
    };
    const msgId = await enqueueInviteSend(payload);
    if (msgId !== null) enqueued += 1;
  }

  return { kind: "enqueued", enqueued };
}
