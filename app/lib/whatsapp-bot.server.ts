import {
  appendMessage,
  findUserByWaId,
  updateUser,
  upsertUser,
} from "~/lib/db.server";
import { messages } from "~/lib/bot-messages.nl";
import { tryResolvePendingFriend } from "~/lib/friends.server";
import { mastra } from "~/lib/mastra";
import { RequestContext } from "@mastra/core/request-context";
import type { TwilioInboundMessage } from "~/lib/twilio.server";
import { sendWhatsAppMessage } from "~/lib/whatsapp-messaging.server";
import type { User } from "~/types/domain";

const DONE_MARKER = "[DONE]";

function normalizeCommand(body: string): string {
  return body.trim().toUpperCase();
}

function displayName(profileName: string, waId: string): string {
  return profileName.trim() || waId || "daar";
}

async function runProfileAgent(
  user: User,
  inboundBody: string,
): Promise<string> {
  const agent = mastra.getAgent("profileAgent");
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
    await updateUser(user.id, {
      activeFlow: null,
      onboardingComplete: true,
    });
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

  let replyBody: string | undefined;

  if (command === "STOP") {
    await updateUser(user.id, {
      optedIn: false,
      onboardingComplete: false,
      activeFlow: null,
      level: null,
      favoritePlayerRefs: [],
      preferredClubIds: [],
      matchPreference: null,
      matchLevelMin: null,
      matchLevelMax: null,
      pendingFriend: null,
    });
    replyBody = messages.optOutConfirmed;
  } else if (command === "HELP") {
    replyBody = messages.help;
  } else if (command === "JA") {
    user = await updateUser(user.id, {
      optedIn: true,
      onboardingComplete: false,
      activeFlow: "onboarding",
      level: null,
      favoritePlayerRefs: [],
      preferredClubIds: [],
      matchPreference: null,
      matchLevelMin: null,
      matchLevelMax: null,
      pendingFriend: null,
    });
    replyBody = messages.optInConfirmed;
  } else if (command === "FRIENDS" || command === "MAATJES") {
    if (!user.optedIn) {
      replyBody = messages.optInRequired;
    } else {
      user = await updateUser(user.id, { activeFlow: "favorites" });
      replyBody = messages.friendsStart;
    }
  } else if (!user.optedIn) {
    if (isNewUser) {
      const name = displayName(inbound.profileName, waId);
      replyBody = messages.welcome(name);
    } else {
      replyBody = messages.optInRequired;
    }
  } else {
    const pending = await tryResolvePendingFriend(user, inbound.body);
    if (pending.handled) {
      user = pending.user;
      replyBody = pending.reply;
    } else if (
      user.activeFlow === "onboarding" ||
      user.activeFlow === "favorites" ||
      (!user.onboardingComplete && user.optedIn)
    ) {
      replyBody = await runProfileAgent(user, inbound.body);
    } else {
      replyBody = messages.unknownCommand;
    }
  }

  const outbound = replyBody ?? messages.unknownCommand;
  await sendWhatsAppMessage(user.id, outbound);
  return outbound;
}
