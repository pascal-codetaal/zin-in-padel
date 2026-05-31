import { prisma } from "~/lib/prisma.server";
import type { WaitlistFormInput } from "~/lib/waitlist-form.server";

export type WaitlistSignupRow = {
  id: string;
  phone: string;
  tvMemberId: number;
  clubId: string | null;
  createdAt: Date;
  member: { name: string; currentRank: number; gender: string };
  club: { name: string; city: string } | null;
};

export async function countWaitlistSignups(): Promise<number> {
  return prisma.waitlistSignup.count();
}

export async function listWaitlistSignups(limit = 200): Promise<WaitlistSignupRow[]> {
  return prisma.waitlistSignup.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      phone: true,
      tvMemberId: true,
      clubId: true,
      createdAt: true,
      member: {
        select: { name: true, currentRank: true, gender: true },
      },
      club: {
        select: { name: true, city: true },
      },
    },
  });
}

export async function upsertWaitlistSignup(
  input: WaitlistFormInput,
): Promise<{ created: boolean; id: string }> {
  const now = new Date();
  const existing = await prisma.waitlistSignup.findUnique({
    where: { phone: input.phone },
  });

  const data = {
    tvMemberId: input.tvMemberId,
    clubId: input.clubId,
    consent: input.consent,
    updatedAt: now,
  };

  if (existing) {
    await prisma.waitlistSignup.update({
      where: { phone: input.phone },
      data,
    });
    return { created: false, id: existing.id };
  }

  const created = await prisma.waitlistSignup.create({
    data: {
      id: crypto.randomUUID(),
      phone: input.phone,
      ...data,
      createdAt: now,
    },
  });
  return { created: true, id: created.id };
}
