import type { Prisma } from "@prisma/client";
import { prisma } from "~/lib/prisma.server";
import { formatPersonName } from "~/lib/person-name";
import {
  buildReferralBotMessage,
  normalizeReferralCode,
  parseReferralCodeFromMessage,
  REFERRAL_CAMPAIGN,
  REFERRAL_STATUSES,
} from "~/lib/referrals.shared";

export type ReferralShare = {
  code: string;
  botMessage: string;
  whatsappUrl: string | null;
  qualifiedCount: number;
  pendingCount: number;
};

export type ReferralLeaderboardEntry = {
  userId: string;
  displayName: string;
  qualifiedCount: number;
  lastQualifiedAt: Date | null;
};

export type ReferralAdminSummary = {
  pendingCount: number;
  qualifiedCount: number;
  disqualifiedCount: number;
  leaderboard: ReferralLeaderboardEntry[];
  recent: {
    id: string;
    status: string;
    attributedAt: Date;
    qualifiedAt: Date | null;
    inviterName: string;
    referredName: string;
  }[];
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function createReferralCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

function whatsAppNumberFromEnv(from: string | undefined): string | null {
  if (!from?.trim()) return null;
  const digits = from.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  profileName: string;
}): string {
  return formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: "Speler",
  });
}

export function buildReferralWhatsAppUrl(
  twilioWhatsAppFrom: string | undefined,
  code: string,
): string | null {
  const number = whatsAppNumberFromEnv(twilioWhatsAppFrom);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(
    buildReferralBotMessage(code),
  )}`;
}

export async function ensureReferralCodeForUser(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!existing) throw new Error(`User not found: ${userId}`);
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createReferralCode();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code, updatedAt: new Date() },
      });
      return code;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
  }

  throw new Error("Could not generate unique referral code");
}

export async function getReferralShareForUser(
  userId: string,
  twilioWhatsAppFrom: string | undefined,
): Promise<ReferralShare> {
  const code = await ensureReferralCodeForUser(userId);
  const [qualifiedCount, pendingCount] = await Promise.all([
    prisma.referralAttribution.count({
      where: {
        campaignSlug: REFERRAL_CAMPAIGN.slug,
        inviterId: userId,
        status: REFERRAL_STATUSES.qualified,
      },
    }),
    prisma.referralAttribution.count({
      where: {
        campaignSlug: REFERRAL_CAMPAIGN.slug,
        inviterId: userId,
        status: REFERRAL_STATUSES.pending,
      },
    }),
  ]);

  return {
    code,
    botMessage: buildReferralBotMessage(code),
    whatsappUrl: buildReferralWhatsAppUrl(twilioWhatsAppFrom, code),
    qualifiedCount,
    pendingCount,
  };
}

export async function recordReferralFromMessage(input: {
  referredUserId: string;
  message: string;
}): Promise<{ ok: true; code: string } | { ok: false; reason: string }> {
  const code = parseReferralCodeFromMessage(input.message);
  if (!code) return { ok: false, reason: "missing_code" };

  const inviter = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });
  if (!inviter) return { ok: false, reason: "unknown_code" };
  if (inviter.id === input.referredUserId) {
    return { ok: false, reason: "self_referral" };
  }

  try {
    await prisma.referralAttribution.create({
      data: {
        id: crypto.randomUUID(),
        campaignSlug: REFERRAL_CAMPAIGN.slug,
        inviterId: inviter.id,
        referredUserId: input.referredUserId,
        status: REFERRAL_STATUSES.pending,
        attributedAt: new Date(),
      },
    });
    return { ok: true, code };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, reason: "already_attributed" };
    }
    throw error;
  }
}

export async function qualifyReferralForUser(
  referredUserId: string,
): Promise<boolean> {
  const updated = await prisma.referralAttribution.updateMany({
    where: {
      campaignSlug: REFERRAL_CAMPAIGN.slug,
      referredUserId,
      status: REFERRAL_STATUSES.pending,
    },
    data: {
      status: REFERRAL_STATUSES.qualified,
      qualifiedAt: new Date(),
    },
  });
  return updated.count > 0;
}

export async function findReferralInviterByCode(code: string): Promise<{
  displayName: string;
} | null> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const inviter = await prisma.user.findUnique({
    where: { referralCode: normalized },
    select: {
      firstName: true,
      lastName: true,
      profileName: true,
    },
  });
  if (!inviter) return null;
  return { displayName: displayName(inviter) };
}

export async function listReferralLeaderboard(
  limit = 25,
): Promise<ReferralLeaderboardEntry[]> {
  const rows = await prisma.referralAttribution.groupBy({
    by: ["inviterId"],
    where: {
      campaignSlug: REFERRAL_CAMPAIGN.slug,
      status: REFERRAL_STATUSES.qualified,
    },
    _count: { _all: true },
    _max: { qualifiedAt: true },
    orderBy: [
      { _count: { inviterId: "desc" } },
      { _max: { qualifiedAt: "asc" } },
    ],
    take: limit,
  });

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((row) => row.inviterId) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      profileName: true,
    },
  });
  const usersById = new Map(users.map((user) => [user.id, user]));

  return rows.map((row) => {
    const user = usersById.get(row.inviterId);
    return {
      userId: row.inviterId,
      displayName: user ? displayName(user) : "Speler",
      qualifiedCount: row._count._all,
      lastQualifiedAt: row._max.qualifiedAt,
    };
  });
}

export async function getReferralAdminSummary(): Promise<ReferralAdminSummary> {
  const [pendingCount, qualifiedCount, disqualifiedCount, leaderboard, recent] =
    await Promise.all([
      prisma.referralAttribution.count({
        where: {
          campaignSlug: REFERRAL_CAMPAIGN.slug,
          status: REFERRAL_STATUSES.pending,
        },
      }),
      prisma.referralAttribution.count({
        where: {
          campaignSlug: REFERRAL_CAMPAIGN.slug,
          status: REFERRAL_STATUSES.qualified,
        },
      }),
      prisma.referralAttribution.count({
        where: {
          campaignSlug: REFERRAL_CAMPAIGN.slug,
          status: REFERRAL_STATUSES.disqualified,
        },
      }),
      listReferralLeaderboard(10),
      prisma.referralAttribution.findMany({
        where: { campaignSlug: REFERRAL_CAMPAIGN.slug },
        orderBy: { attributedAt: "desc" },
        take: 25,
        include: {
          inviter: {
            select: {
              firstName: true,
              lastName: true,
              profileName: true,
            },
          },
          referredUser: {
            select: {
              firstName: true,
              lastName: true,
              profileName: true,
            },
          },
        },
      }),
    ]);

  return {
    pendingCount,
    qualifiedCount,
    disqualifiedCount,
    leaderboard,
    recent: recent.map((row) => ({
      id: row.id,
      status: row.status,
      attributedAt: row.attributedAt,
      qualifiedAt: row.qualifiedAt,
      inviterName: displayName(row.inviter),
      referredName: displayName(row.referredUser),
    })),
  };
}

export type ReferralAttributionCreateInput =
  Prisma.ReferralAttributionCreateInput;
