import {
  appendMessage,
  findUserByWaId,
  updateUser,
  upsertUser,
} from "~/lib/db.server";
import { messages } from "~/lib/bot-messages.nl";
import { mastra } from "~/lib/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { messagingReply } from "~/lib/twilio.server";
import type { TwilioInboundMessage } from "~/lib/twilio.server";
import type { User } from "~/types/domain";

const DONE_MARKER = "[DONE]";

function normalizeCommand(body: string): string {
  return body.trim().toUpperCase();
}

function displayName(profileName: string, waId: string): string {
  return profileName.trim() || waId || "daar";
}

async function runFavoritesAgent(
  user: User,
  inboundBody: string,
): Promise<string> {
  const agent = mastra.getAgent("favoritesAgent");
  const requestContext = new RequestContext();
  requestContext.set("userId", user.id);
  const result = await agent.generate(inboundBody, {
    memory: { thread: user.id, resource: user.id },
    requestContext,
  });

  let text = result.text ?? "";
  const isDone = text.includes(DONE_MARKER);
  if (isDone) {
    text = text.replace(DONE_MARKER, "").trim();
    await updateUser(user.id, { activeFlow: null });
  }

  return text || messages.unknownCommand;
}

export async function handleIncomingMessage(
  inbound: TwilioInboundMessage,
): Promise<string> {
  const waId = inbound.waId || inbound.from.replace(/^whatsapp:/, "");
  const command = normalizeCommand(inbound.body);

  const existingUser = await findUserByWaId(waId);
  const isNewUser = !existingUser;

  let user = await upsertUser({
    waId,
    phone: inbound.from,
    profileName: inbound.profileName,
  });

  await appendMessage(user.id, inbound.body, "in");

  let replyBody: string;

  if (command === "STOP") {
    await updateUser(user.id, {
      optedIn: false,
      onboardingComplete: false,
      onboardingStep: 0,
      activeFlow: null,
    });
    replyBody = messages.optOutConfirmed;
  } else if (command === "HELP") {
    replyBody = messages.help;
  } else if (command === "JA") {
    user = await updateUser(user.id, {
      optedIn: true,
      onboardingComplete: true,
      onboardingStep: 1,
      activeFlow: "favorites",
    });
    replyBody = messages.optInConfirmed;
  } else if (command === "MAATJES") {
    if (!user.optedIn) {
      replyBody = messages.optInRequired;
    } else {
      user = await updateUser(user.id, { activeFlow: "favorites" });
      replyBody = messages.maatjesStart;
    }
  } else if (!user.optedIn) {
    if (isNewUser) {
      const name = displayName(inbound.profileName, waId);
      replyBody = messages.welcome(name);
    } else {
      replyBody = messages.optInRequired;
    }
  } else if (user.activeFlow === "favorites") {
    replyBody = await runFavoritesAgent(user, inbound.body);
  } else {
    replyBody = messages.unknownCommand;
  }

  await appendMessage(user.id, replyBody, "out");
  return messagingReply(replyBody);
}
