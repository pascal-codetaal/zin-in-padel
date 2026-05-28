/**
 * Test setup: Joris Heyens (organiser) invites Pascal Van Hecke (you).
 *
 * Usage:
 *   pnpm test:joris-invites-pascal
 *
 * Reads phones from env (.env):
 *   TEST_JORIS_PHONE    (organiser)
 *   TEST_PASCAL_PHONE   (invitee)
 *
 * Creates a draft match with Pascal as a phase-1 friend invite, finalises it,
 * then dispatches the invite via Twilio (or pgmq if INVITE_QUEUE_ENABLED).
 */

import { prisma } from "../app/lib/prisma.server";
import { runSetup } from "./setup-real-test-shared";

const jorisPhone = process.env.TEST_JORIS_PHONE;
const pascalPhone = process.env.TEST_PASCAL_PHONE;
if (!jorisPhone || !pascalPhone) {
  console.error(
    "Missing TEST_JORIS_PHONE and/or TEST_PASCAL_PHONE in .env (see .env.example).",
  );
  process.exit(1);
}

runSetup({
  organiser: { firstName: "Joris", lastName: "Heyens", phone: jorisPhone },
  invitee: { firstName: "Pascal", lastName: "Van Hecke", phone: pascalPhone },
})
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
