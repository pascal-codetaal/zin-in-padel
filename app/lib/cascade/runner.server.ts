/**
 * Cascade runner — thin Prisma adapter around the pure `planCascadeTick`
 * planner. The runner discovers due matches, loads the audience context the
 * planner needs, and persists the plan in a single transaction per match.
 *
 * All cascade policy lives in `plan.ts` / `decide.ts` / `audience.ts`. This
 * file is intentionally I/O-only — keep it that way.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "~/lib/prisma.server";
import {
  matchRowToDomain,
  userRowToDomain,
} from "~/lib/db.server";
import type { Match } from "~/types/domain";
import type { AudienceCandidate, AudienceIndex } from "./audience";
import { planCascadeTick, type CascadePlan } from "./plan";
import { dispatchOrEnqueueInvites } from "./dispatch.server";
import { decideRunnerNotices } from "./organiser-notify";
import { notifyOrganiser } from "./organiser-notify.server";

type TxClient = Prisma.TransactionClient;

export type CascadePlanSummary =
  | { kind: "idle"; reason: string }
  | { kind: "fire-phase"; phase: 1 | 2 | 3; invitesInserted: number }
  | { kind: "mark-full" }
  | { kind: "mark-exhausted" };

export type TickTrace = {
  ranAt: string;
  matchesConsidered: number;
  perMatch: Array<{ matchId: string; plan: CascadePlanSummary }>;
};

/**
 * Tick once: process every match whose `nextCascadeAt <= now` and is open.
 * Each match's plan is applied in its own transaction so a single failing
 * match doesn't poison the batch.
 */
export async function runCascadeTick(now: Date): Promise<TickTrace> {
  const dueMatches = await prisma.match.findMany({
    where: {
      status: "open",
      nextCascadeAt: { lte: now },
    },
    select: { id: true },
  });

  const perMatch: TickTrace["perMatch"] = [];
  for (const { id } of dueMatches) {
    const summary = await tickOneMatch(id, now);
    perMatch.push({ matchId: id, plan: summary });
  }

  return {
    ranAt: now.toISOString(),
    matchesConsidered: dueMatches.length,
    perMatch,
  };
}

export async function runCascadeTickForMatch(
  matchId: string,
  now: Date,
): Promise<CascadePlanSummary> {
  return tickOneMatch(matchId, now);
}

async function tickOneMatch(
  matchId: string,
  now: Date,
): Promise<CascadePlanSummary> {
  const summary = await prisma.$transaction(async (tx) => {
    const { match, candidates, index } = await loadCascadeContext(tx, matchId);
    const plan = planCascadeTick(match, candidates, index, now);
    await applyPlan(tx, matchId, plan);
    return summarisePlan(plan);
  });
  // Phase E.0: fire freshly-inserted invites for this match. Done outside
  // the cascade transaction so the cascade state advances even if a single
  // recipient lookup blips.
  if (summary.kind === "fire-phase" && summary.invitesInserted > 0) {
    await dispatchOrEnqueueInvites(matchId, now);
  }
  // Phase H: notify organiser on cascade-terminal outcomes (match-full /
  // cascade-exhausted with open slots). In-app surfaces still cover everything
  // else; organiser WhatsApp stays low-noise.
  if (summary.kind === "mark-full" || summary.kind === "mark-exhausted") {
    const matchRow = await prisma.match.findUnique({
      where: { id: matchId },
      include: { invitedPlayers: true, confirmedSlots: true, clubs: true },
    });
    if (matchRow) {
      const match = matchRowToDomain(matchRow);
      const notices = decideRunnerNotices({ match, planKind: summary.kind });
      if (notices.length > 0) {
        await notifyOrganiser({ match, notices });
      }
    }
  }
  return summary;
}

function summarisePlan(plan: CascadePlan): CascadePlanSummary {
  switch (plan.kind) {
    case "idle":
      return { kind: "idle", reason: plan.reason };
    case "fire-phase":
      return {
        kind: "fire-phase",
        phase: plan.phase,
        invitesInserted: plan.invitesToInsert.length,
      };
    case "mark-full":
      return { kind: "mark-full" };
    case "mark-exhausted":
      return { kind: "mark-exhausted" };
  }
}

async function loadCascadeContext(
  tx: TxClient,
  matchId: string,
): Promise<{
  match: Match;
  candidates: AudienceCandidate[];
  index: AudienceIndex;
}> {
  const matchRow = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    include: { invitedPlayers: true, confirmedSlots: true, clubs: true },
  });
  const match = matchRowToDomain(matchRow);

  // Candidate pool = every opted-in User except the organiser. Per-phase
  // exclusions live in the pure audience filter.
  const userRows = await tx.user.findMany({
    where: { optedIn: true, id: { not: match.organizerId } },
    include: { favorites: true, preferredClubs: true },
  });
  const candidates: AudienceCandidate[] = userRows.map((row) => {
    const user = userRowToDomain(row);
    return { user, ref: stripWhatsAppScheme(user.phone) };
  });

  const friendRefs = new Set<string>(match.invitedFriendRefs);
  const alreadyInvitedRefs = new Set<string>(
    match.invitedPlayers.map((i) => i.playerRef),
  );
  const declinedRefs = new Set<string>(
    match.invitedPlayers
      .filter((i) => i.status === "declined")
      .map((i) => i.playerRef),
  );
  const conflictingRefs = match.scheduledAt
    ? await findConflictingPlayerRefs(tx, match)
    : new Set<string>();

  const index: AudienceIndex = {
    alreadyInvitedRefs,
    declinedRefs,
    friendRefs,
    conflictingRefs,
  };

  return { match, candidates, index };
}

function stripWhatsAppScheme(phone: string): string {
  return phone.replace(/^whatsapp:/, "");
}

async function findConflictingPlayerRefs(
  tx: TxClient,
  match: Match,
): Promise<Set<string>> {
  if (!match.scheduledAt) return new Set<string>();
  const start = new Date(match.scheduledAt);
  const end = new Date(start.getTime() + match.durationMinutes * 60_000);

  // Pull every active match in a wide window, filter overlap in memory.
  // Volume is tiny (POC scale) — revisit when this is hot.
  const candidates = await tx.match.findMany({
    where: {
      id: { not: match.id },
      status: { in: ["open", "full", "confirmed"] },
      scheduledAt: {
        gte: new Date(start.getTime() - 6 * 60 * 60_000),
        lte: new Date(end.getTime() + 6 * 60 * 60_000),
      },
    },
    include: { invitedPlayers: true },
  });

  const conflictingRefs = new Set<string>();
  for (const other of candidates) {
    if (!other.scheduledAt) continue;
    const otherStart = other.scheduledAt.getTime();
    const otherEnd = otherStart + other.durationMinutes * 60_000;
    const overlaps = otherStart < end.getTime() && otherEnd > start.getTime();
    if (!overlaps) continue;
    for (const inv of other.invitedPlayers) {
      if (inv.status === "accepted" || inv.status === "pending") {
        conflictingRefs.add(inv.playerRef);
      }
    }
  }
  return conflictingRefs;
}

async function applyPlan(
  tx: TxClient,
  matchId: string,
  plan: CascadePlan,
): Promise<void> {
  if (plan.kind === "idle") return;

  if (plan.kind === "fire-phase") {
    for (const row of plan.invitesToInsert) {
      // Upsert because the planner's audience filter already excludes
      // already-invited refs; if a concurrent writer raced us we don't
      // want to fail the whole transaction.
      await tx.matchInvitedPlayer.upsert({
        where: { matchId_playerRef: { matchId, playerRef: row.playerRef } },
        create: {
          matchId,
          playerRef: row.playerRef,
          token: row.token,
          status: row.status,
          cascadePhase: row.cascadePhase,
          sentAt: row.sentAt,
          respondedAt: row.respondedAt,
        },
        update: {},
      });
    }
  }

  await tx.match.update({
    where: { id: matchId },
    data: {
      currentCascadePhase: plan.matchStateUpdate.currentCascadePhase,
      nextCascadeAt: plan.matchStateUpdate.nextCascadeAt,
      updatedAt: new Date(),
    },
  });
}
