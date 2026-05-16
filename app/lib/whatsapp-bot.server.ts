import {
  appendMessage,
  findUserByWaId,
  getRecentMessages,
  updateUser,
  upsertUser,
} from "~/lib/db.server";
import { messages } from "~/lib/bot-messages.nl";
import { createFavoritesAgent } from "~/lib/mastra/agent.server";
import { messagingReply } from "~/lib/twilio.server";
import type { TwilioInboundMessage } from "~/lib/twilio.server";
import type { Message, User } from "~/types/domain";

const DONE_MARKER = "[DONE]";

function normalizeCommand(body: string): string {
  return body.trim().toUpperCase();
}

function displayName(profileName: string, waId: string): string {
  return profileName.trim() || waId || "daar";
}

function messagesToHistory(history: Message[]) {
  return history.map((m) => ({
    role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
    content: m.body,
  }));
}

async function runFavoritesAgent(
  user: User,
  inboundBody: string,
): Promise<string> {
  const history = await getRecentMessages(user.id, 10);
  const agent = createFavoritesAgent(user.id);
  const result = await agent.generate([
    ...messagesToHistory(history),
    { role: "user", content: inboundBody },
  ]);

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
