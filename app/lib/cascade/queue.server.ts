/**
 * Thin pgmq wrapper for the `invite-sends` queue.
 *
 * Calls Supabase's `pgmq` extension via Prisma's raw query API. Keep this
 * file the only place that knows pgmq SQL — callers deal in typed payloads.
 *
 * Disabled in mock / non-configured environments: `enqueueInviteSend` and
 * the read/delete/archive helpers short-circuit and the runner falls back
 * to the synchronous dispatcher in `send.server.ts`. That keeps the local
 * dev loop working on a vanilla Postgres without pgmq installed.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "~/lib/prisma.server";

export const INVITE_SEND_QUEUE = "invite-sends";

export type InviteSendPayload = {
  inviteToken: string;
  matchId: string;
  phase: 1 | 2 | 3;
};

export type InviteSendMessage = {
  msgId: bigint;
  readCt: number;
  enqueuedAt: Date;
  vt: Date;
  payload: InviteSendPayload;
};

/**
 * True when this process should use pgmq. Off by default — opt in with
 * `INVITE_QUEUE_ENABLED=true` once the migration is applied. Lets us merge
 * the queue worker without forcing every dev box to install pgmq.
 */
export function isInviteQueueEnabled(): boolean {
  return process.env.INVITE_QUEUE_ENABLED === "true";
}

type TxClient = Prisma.TransactionClient | typeof prisma;

export async function enqueueInviteSend(
  payload: InviteSendPayload,
  tx: TxClient = prisma,
): Promise<bigint | null> {
  if (!isInviteQueueEnabled()) return null;

  const rows = await tx.$queryRaw<{ send: bigint }[]>`
    SELECT pgmq.send(
      ${INVITE_SEND_QUEUE}::text,
      ${JSON.stringify(payload)}::jsonb
    ) AS send
  `;
  return rows[0]?.send ?? null;
}

/**
 * Read up to `qty` messages with a `vt` second visibility timeout. Messages
 * stay in the queue until `deleteInviteSend` or `archiveInviteSend` is
 * called; if the visibility timeout expires they become readable again.
 */
export async function readInviteSendBatch(args: {
  qty: number;
  vtSeconds: number;
}): Promise<InviteSendMessage[]> {
  if (!isInviteQueueEnabled()) return [];

  type RawRow = {
    msg_id: bigint | number;
    read_ct: number;
    enqueued_at: Date;
    vt: Date;
    message: unknown;
  };

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT msg_id, read_ct, enqueued_at, vt, message
    FROM pgmq.read(${INVITE_SEND_QUEUE}::text, ${args.vtSeconds}::integer, ${args.qty}::integer)
  `;

  return rows.map((row) => ({
    msgId: BigInt(row.msg_id),
    readCt: row.read_ct,
    enqueuedAt: row.enqueued_at,
    vt: row.vt,
    payload: row.message as InviteSendPayload,
  }));
}

export async function deleteInviteSend(msgId: bigint): Promise<void> {
  if (!isInviteQueueEnabled()) return;
  await prisma.$executeRaw`
    SELECT pgmq.delete(${INVITE_SEND_QUEUE}::text, ${msgId}::bigint)
  `;
}

export async function archiveInviteSend(msgId: bigint): Promise<void> {
  if (!isInviteQueueEnabled()) return;
  await prisma.$executeRaw`
    SELECT pgmq.archive(${INVITE_SEND_QUEUE}::text, ${msgId}::bigint)
  `;
}

/**
 * Drain (archive) any queued sends still pending for a given match. Used by
 * cancel-match in Phase G3; called here so all pgmq SQL stays colocated.
 */
export async function archiveInviteSendsForMatch(matchId: string): Promise<number> {
  if (!isInviteQueueEnabled()) return 0;

  // pgmq stores messages in `pgmq.q_<queue_name>`. We can't reference the
  // table directly (queue name comes from data), so use a dynamic SQL via
  // `format`/`EXECUTE` in a DO block.
  const result = await prisma.$queryRaw<{ archived: number }[]>`
    WITH archived AS (
      SELECT pgmq.archive(${INVITE_SEND_QUEUE}::text, msg_id) AS archived_id
      FROM pgmq.q_invite_sends
      WHERE message ->> 'matchId' = ${matchId}
    )
    SELECT count(*)::int AS archived FROM archived
  `;
  return result[0]?.archived ?? 0;
}
