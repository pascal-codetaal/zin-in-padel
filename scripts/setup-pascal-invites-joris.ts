/**
 * Test setup: Pascal Van Hecke (organiser) invites Joris Heyens (you).
 *
 * Usage:
 *   pnpm test:pascal-invites-joris
 *
 * Reads phones from env (.env):
 *   TEST_PASCAL_PHONE   (organiser)
 *   TEST_JORIS_PHONE    (invitee)
 *
 * Creates a draft match with Joris as a phase-1 friend invite, finalises it,
 * then dispatches the invite via Twilio (or pgmq if INVITE_QUEUE_ENABLED).
 */

import { prisma } from "../app/lib/prisma.server";
import { runSetup } from "./setup-real-test-shared";

const pascalPhone = process.env.TEST_PASCAL_PHONE;
const jorisPhone = process.env.TEST_JORIS_PHONE;
if (!pascalPhone || !jorisPhone) {
  console.error(
    "Missing TEST_PASCAL_PHONE and/or TEST_JORIS_PHONE in .env (see .env.example).",
  );
  process.exit(1);
}

runSetup({
  organiser: { firstName: "Pascal", lastName: "Van Hecke", phone: pascalPhone },
  invitee: { firstName: "Joris", lastName: "Heyens", phone: jorisPhone },
})
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
