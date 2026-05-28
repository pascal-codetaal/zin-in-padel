/**
 * Shared helper for setup-pascal-invites-joris.ts and setup-joris-invites-pascal.ts.
 * Creates the two users + a draft match where `organiser` invites `invitee`,
 * finalises the draft, and dispatches the phase-1 invite (Twilio or pgmq).
 */

import { prisma } from "../app/lib/prisma.server";
import { createManageToken } from "../app/lib/maatjes-url.server";
import { playerRefFromPhone } from "../app/types/domain";
import { createInviteToken } from "../app/lib/cascade/token";
import { finalizeMatchDraft } from "../app/lib/db.server";
import { dispatchOrEnqueueInvites } from "../app/lib/cascade/dispatch.server";

export type Person = {
  firstName: string;
  lastName: string;
  phone: string; // E.164, with or without leading "+"
};

const norm = (p: string) => (p.startsWith("+") ? p : `+${p}`);

export async function runSetup(args: {
  organiser: Person;
  invitee: Person;
}) {
  const now = new Date();

  const organiser = { ...args.organiser, phone: norm(args.organiser.phone) };
  const invitee = { ...args.invitee, phone: norm(args.invitee.phone) };
  const organiserWaId = organiser.phone.replace(/^\+/, "");
  const inviteeWaId = invitee.phone.replace(/^\+/, "");
  const organiserName = `${organiser.firstName} ${organiser.lastName}`;
  const inviteeName = `${invitee.firstName} ${invitee.lastName}`;

  // ---- Wipe any prior test matches for this organiser ----
  const existingOrganiser = await prisma.user.findUnique({
    where: { waId: organiserWaId },
  });
  if (existingOrganiser) {
    const stale = await prisma.match.findMany({
      where: { organizerId: existingOrganiser.id },
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.match.deleteMany({
        where: { id: { in: stale.map((m) => m.id) } },
      });
      console.log(`✓ Deleted ${stale.length} stale match(es) for ${organiserName}`);
    }
  }

  // ---- Players ----
  const organiserRef = playerRefFromPhone(organiser.phone);
  const inviteeRef = playerRefFromPhone(invitee.phone);

  await prisma.player.upsert({
    where: { ref: organiserRef },
    create: { ref: organiserRef, phone: organiser.phone, name: organiserName },
    update: { phone: organiser.phone, name: organiserName },
  });
  await prisma.player.upsert({
    where: { ref: inviteeRef },
    create: { ref: inviteeRef, phone: invitee.phone, name: inviteeName },
    update: { phone: invitee.phone, name: inviteeName },
  });
  console.log("✓ Players upserted");

  // ---- Users (opted in) ----
  const organiserUser = await prisma.user.upsert({
    where: { waId: organiserWaId },
    create: {
      id: crypto.randomUUID(),
      manageToken: createManageToken(),
      waId: organiserWaId,
      phone: organiser.phone,
      profileName: organiserName,
      firstName: organiser.firstName,
      lastName: organiser.lastName,
      optedIn: true,
      onboardingComplete: true,
      level: 3,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      phone: organiser.phone,
      profileName: organiserName,
      firstName: organiser.firstName,
      lastName: organiser.lastName,
      optedIn: true,
      onboardingComplete: true,
      level: 3,
      updatedAt: now,
    },
  });

  const inviteeUser = await prisma.user.upsert({
    where: { waId: inviteeWaId },
    create: {
      id: crypto.randomUUID(),
      manageToken: createManageToken(),
      waId: inviteeWaId,
      phone: invitee.phone,
      profileName: inviteeName,
      firstName: invitee.firstName,
      lastName: invitee.lastName,
      optedIn: true,
      onboardingComplete: true,
      level: 3,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      phone: invitee.phone,
      profileName: inviteeName,
      firstName: invitee.firstName,
      lastName: invitee.lastName,
      optedIn: true,
      onboardingComplete: true,
      level: 3,
      updatedAt: now,
    },
  });
  console.log("✓ Users upserted", {
    organiser: organiserUser.id,
    invitee: inviteeUser.id,
  });

  // ---- Organiser favorites invitee (UI nicety; phase 1 reads MatchInvitedPlayer) ----
  await prisma.userFavorite.upsert({
    where: {
      userId_playerRef: { userId: organiserUser.id, playerRef: inviteeRef },
    },
    create: { userId: organiserUser.id, playerRef: inviteeRef },
    update: {},
  });

  // ---- Club ----
  let club = await prisma.club.findFirst();
  if (!club) {
    club = await prisma.club.create({
      data: {
        id: crypto.randomUUID(),
        name: "Test Padel Club",
        city: "Antwerpen",
      },
    });
    console.log("✓ Club created:", club.name);
  } else {
    console.log("✓ Using existing club:", club.name);
  }

  // ---- Draft match with invitee as phase-1 friend invite ----
  const matchId = crypto.randomUUID();
  await prisma.match.create({
    data: {
      id: matchId,
      organizerId: organiserUser.id,
      clubId: club.id,
      scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      durationMinutes: 90,
      format: "mixed",
      totalSlots: 4,
      fallbackToLevelRange: true,
      fallbackLevelMin: 1,
      fallbackLevelMax: 7,
      fallbackLevelDelayMinutes: 60,
      fallbackToEveryone: true,
      fallbackEveryoneDelayMinutes: 120,
      currentCascadePhase: 0,
      nextCascadeAt: null,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      clubs: { create: [{ clubId: club.id }] },
      confirmedSlots: { create: [{ idx: 0, name: organiserName }] },
      invitedPlayers: {
        create: [
          {
            playerRef: inviteeRef,
            token: createInviteToken(),
            status: "pending",
            cascadePhase: 1,
            sentAt: null,
          },
        ],
      },
    },
  });
  console.log("✓ Draft match created:", matchId);

  // ---- Finalise → phase=1, schedules phase-2 tick ----
  const finalised = await finalizeMatchDraft(matchId, "open");
  console.log(
    "✓ Finalised match. currentCascadePhase:",
    finalised.currentCascadePhase,
  );
  console.log("  nextCascadeAt:", finalised.nextCascadeAt);

  // ---- Dispatch phase-1 invite ----
  const result = await dispatchOrEnqueueInvites(matchId, new Date());
  console.log("✓ Dispatch result:", result);

  console.log(`\nDone. ${organiserName} invited ${inviteeName}.`);
  console.log(`Check WhatsApp on ${invitee.phone}.`);
  console.log("If nothing arrives within ~10s, check:");
  console.log("  - Twilio console → Monitor → Logs → Messaging");
  console.log("  - Invitee phone joined to Twilio WhatsApp sandbox");
  console.log("  - TWILIO_ACCOUNT_SID starts with 'AC' (not 'SK')");
}
