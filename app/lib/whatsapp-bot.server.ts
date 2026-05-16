import {
  appendMessage,
  findUserByWaId,
  updateUser,
  upsertUser,
} from "~/lib/db.server";
import { messages } from "~/lib/bot-messages.nl";
import { messagingReply } from "~/lib/twilio.server";
import type { TwilioInboundMessage } from "~/lib/twilio.server";

function normalizeCommand(body: string): string {
  return body.trim().toUpperCase();
}

function displayName(profileName: string, waId: string): string {
  return profileName.trim() || waId || "daar";
}

export async function handleIncomingMessage(
  inbound: TwilioInboundMessage,
): Promise<string> {
  const waId = inbound.waId || inbound.from.replace(/^whatsapp:/, "");
  const command = normalizeCommand(inbound.body);

  const existingUser = await findUserByWaId(waId);
  const isNewUser = !existingUser;

  const user = await upsertUser({
    waId,
    phone: inbound.from,
    profileName: inbound.profileName,
  });

  await appendMessage(user.id, inbound.body);

  if (command === "STOP") {
    await updateUser(user.id, {
      optedIn: false,
      onboardingComplete: false,
      onboardingStep: 0,
    });
    return messagingReply(messages.optOutConfirmed);
  }

  if (command === "HELP") {
    return messagingReply(messages.help);
  }

  if (command === "JA") {
    await updateUser(user.id, {
      optedIn: true,
      onboardingComplete: true,
      onboardingStep: 1,
    });
    return messagingReply(messages.optInConfirmed);
  }

  if (!user.optedIn) {
    if (isNewUser) {
      const name = displayName(inbound.profileName, waId);
      return messagingReply(messages.welcome(name));
    }
    return messagingReply(messages.optInRequired);
  }

  return messagingReply(messages.unknownCommand);
}
