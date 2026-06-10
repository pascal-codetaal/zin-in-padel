/**
 * Match opening — the single home for the draft → open kickoff.
 *
 * Sequence (one `now` threads all three steps):
 *   1. finalizeMatchDraft — conditional status flip + initial cascade state
 *   2. dispatchOrEnqueueInvites — phase-1 Match Invites (inline or BullMQ)
 *   3. scheduleCascadeFallbackEvents — delayed phase 2/3 events (queue mode)
 *
 * Idempotent: only a draft opens. Re-taps and agent retries get
 * `already-open` with the live Match instead of shifting cascade deadlines.
 * I/O failures after the flip propagate to the caller — retrying openMatch
 * is safe (the flip won't re-run; dispatch skips `sentAt`, jobs dedupe on
 * deterministic IDs per ADR-0005).
 */

import { finalizeMatchDraft, findMatchById } from "~/lib/db.server";
import type { Match } from "~/types/domain";
import {
  dispatchOrEnqueueInvites,
  scheduleCascadeFallbackEvents,
} from "./dispatch.server";
import { decideMatchOpenability } from "./open-match";

export type OpenMatchResult =
  | { kind: "opened"; match: Match }
  | { kind: "already-open"; match: Match }
  | {
      kind: "not-openable";
      reason: "missing-schedule" | "missing-club" | "cancelled";
    };

/** Returns `null` when no Match exists for `matchId`. */
export async function openMatch(
  matchId: string,
  now: Date,
): Promise<OpenMatchResult | null> {
  const match = await findMatchById(matchId);
  if (!match) return null;

  const openability = decideMatchOpenability(match);
  if (openability.kind === "already-open") {
    return { kind: "already-open", match };
  }
  if (openability.kind === "not-openable") {
    return openability;
  }

  const finalized = await finalizeMatchDraft(matchId, now);
  if (!finalized) {
    // Lost a concurrent open between the read and the conditional flip —
    // someone else already opened it; hand back the live Match.
    const live = await findMatchById(matchId);
    if (!live) return null;
    return { kind: "already-open", match: live };
  }

  await dispatchOrEnqueueInvites(finalized.id, now);
  await scheduleCascadeFallbackEvents(finalized.id);
  return { kind: "opened", match: finalized };
}
