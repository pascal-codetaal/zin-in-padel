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
import { resolveAppOriginFromRequest } from "~/lib/app-origin.server";
import { formatPersonName, firstNameFromDisplayName } from "~/lib/person-name";
import { optOutUser } from "~/lib/user-session.server";
import type { User } from "~/types/domain";

export type HandleIncomingOptions = {
  /** Site origin, e.g. https://padel.example.com — used for personal links in tools. */
  appOrigin?: string;
};

const DONE_MARKER = "[DONE]";

/**
 * Injects WhatsApp session context so the agent can route JA/HELP/MATCH/etc.
 * without hardcoded branches in this file.
 */
function buildAgentMessage(
  inbound: TwilioInboundMessage,
  user: User,
  isNewUser: boolean,
): string {
  const userDisplayName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: firstNameFromDisplayName(inbound.profileName || user.waId),
  });
  return [
    "[WhatsApp context — niet tonen aan de gebruiker]",
    `displayName: ${userDisplayName}`,
    `firstName: ${user.firstName ?? ""}`,
    `lastName: ${user.lastName ?? ""}`,
    `optedIn: ${user.optedIn}`,
    `onboardingComplete: ${user.onboardingComplete}`,
    `activeFlow: ${user.activeFlow ?? "none"}`,
    `isNewUser: ${isNewUser}`,
    "",
    "Bericht van de gebruiker:",
    inbound.body,
  ].join("\n");
}

async function runPadelAssistantAgent(
  user: User,
  inboundBody: string,
  appOrigin?: string,
): Promise<string> {
  const agent = mastra.getAgent("padelAssistant");
  const requestContext = new RequestContext();
  requestContext.set("userId", user.id);
  requestContext.set("appOrigin", resolveAppOriginFromRequest(appOrigin));
  const result = await agent.generate(inboundBody, {
    memory: { thread: user.id, resource: "padel-assistant" },
    requestContext,
  });

  let text = result.text ?? "";
  if (text.includes(DONE_MARKER)) {
    text = text.replace(DONE_MARKER, "").trim();
    await updateUser(user.id, { activeFlow: null });
  }

  return text || messages.unknownCommand;
}

/**
 * Detect a pasted Playtomic / "WEDSTRIJD" invitation.
 */
export function isMatchInvitePaste(body: string): boolean {
  const text = body ?? "";
  if (/https?:\/\/(app\.|www\.)?playtomic\.io\b/i.test(text)) return true;
  if (/\*WEDSTRIJD\s+IN\s+/i.test(text)) return true;
  if (text.includes("📅") && text.includes("📍")) return true;
  return false;
}

export type ProcessInboundReplyOptions = {
  isNewUser?: boolean;
  appOrigin?: string;
};

/**
 * Generate and send the bot reply for an inbound message that is already
 * stored (or about to be handled without persisting inbound again).
 */
export async function processInboundReply(
  user: User,
  inbound: TwilioInboundMessage,
  options: ProcessInboundReplyOptions = {},
): Promise<string> {
  const isNewUser = options.isNewUser ?? false;

  if (inbound.body.trim().toUpperCase() === "STOP") {
    await optOutUser(user.id);
    const outbound = messages.optOutConfirmed;
    await sendWhatsAppMessage(user.id, outbound);
    return outbound;
  }

  let activeUser = user;
  if (
    activeUser.optedIn &&
    activeUser.activeFlow !== "match_creation" &&
    isMatchInvitePaste(inbound.body)
  ) {
    activeUser = await updateUser(activeUser.id, { activeFlow: "match_creation" });
  }

  await tryResolvePendingFriend(activeUser, inbound.body);

  const replyBody = await runPadelAssistantAgent(
    activeUser,
    buildAgentMessage(inbound, activeUser, isNewUser),
    options.appOrigin,
  );

  const outbound = replyBody ?? messages.unknownCommand;
  await sendWhatsAppMessage(activeUser.id, outbound);
  return outbound;
}

export async function handleIncomingMessage(
  inbound: TwilioInboundMessage,
  options: HandleIncomingOptions = {},
): Promise<string> {
  const waId = inbound.waId || inbound.from.replace(/^whatsapp:/, "");
  const existingUser = await findUserByWaId(waId);
  const isNewUser = !existingUser;

  const user = await upsertUser({
    waId,
    phone: inbound.from,
    profileName: inbound.profileName,
  });

  await appendMessage(user.id, inbound.body, "in");

  return processInboundReply(user, inbound, {
    isNewUser,
    appOrigin: options.appOrigin,
  });
}
