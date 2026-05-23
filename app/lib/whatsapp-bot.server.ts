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
import { buildMaatjesPageUrl } from "~/lib/maatjes-url.server";
import type { User } from "~/types/domain";

export type HandleIncomingOptions = {
  /** Site origin, e.g. https://padel.example.com — used for personal maatjes links. */
  appOrigin?: string;
};

const DONE_MARKER = "[DONE]";

function normalizeCommand(body: string): string {
  return body.trim().toUpperCase();
}

function displayName(profileName: string, waId: string): string {
  return profileName.trim() || waId || "daar";
}

async function runPadelAssistantAgent(
  user: User,
  inboundBody: string,
  appOrigin?: string,
): Promise<string> {
  const agent = mastra.getAgent("padelAssistant");
  const requestContext = new RequestContext();
  requestContext.set("userId", user.id);
  if (appOrigin) {
    requestContext.set("appOrigin", appOrigin);
  }
  const result = await agent.generate(inboundBody, {
    // Single shared resource so all WhatsApp users' threads live under one
    // bucket — Mastra Studio lists threads filtered by resource, and we want
    // an "everyone's chats" view. Per-user scoping happens via `thread`
    // (= user.id) and tool-side userId from requestContext.
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
 * The user shouldn't have to type a command — pasting the message is enough.
 */
export function isMatchInvitePaste(body: string): boolean {
  const text = body ?? "";
  if (/https?:\/\/(app\.|www\.)?playtomic\.io\b/i.test(text)) return true;
  if (/\*WEDSTRIJD\s+IN\s+/i.test(text)) return true;
  // Heuristic: presence of the calendar + location emojis used by the format.
  if (text.includes("📅") && text.includes("📍")) return true;
  return false;
}

function maatjesLinkForUser(user: User, appOrigin: string | undefined): string {
  if (!appOrigin) return "";
  const request = new Request(`${appOrigin}/`);
  return buildMaatjesPageUrl(request, user.manageToken);
}

export async function handleIncomingMessage(
  inbound: TwilioInboundMessage,
  options: HandleIncomingOptions = {},
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
      gender: null,
      level: null,
      preferredSide: null,
      playsBothSides: false,
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
      gender: null,
      level: null,
      preferredSide: null,
      playsBothSides: false,
      favoritePlayerRefs: [],
      preferredClubIds: [],
      matchPreference: null,
      matchLevelMin: null,
      matchLevelMax: null,
      pendingFriend: null,
    });
    const manageUrl = maatjesLinkForUser(user, options.appOrigin);
    replyBody = manageUrl
      ? `${messages.optInConfirmed}\n\nBeheer je maatjes online:\n${manageUrl}`
      : messages.optInConfirmed;
  } else if (command === "FRIENDS" || command === "MAATJES") {
    if (!user.optedIn) {
      replyBody = messages.optInRequired;
    } else {
      user = await updateUser(user.id, { activeFlow: "favorites" });
      replyBody = messages.friendsStart;
    }
  } else if (command === "MATCH" || command === "WEDSTRIJD") {
    if (!user.optedIn) {
      replyBody = messages.optInRequired;
    } else {
      user = await updateUser(user.id, { activeFlow: "match_creation" });
      replyBody = messages.matchStartFresh;
    }
  } else if (!user.optedIn) {
    if (isNewUser) {
      const name = displayName(inbound.profileName, waId);
      replyBody = messages.welcome(name);
    } else {
      replyBody = messages.optInRequired;
    }
  } else {
    // Auto-activate the match flow when the user pastes an invite, so the
    // agent's memory + activeFlow hint line up. (The agent will read its own
    // tools to decide what to do regardless.)
    if (
      user.activeFlow !== "match_creation" &&
      isMatchInvitePaste(inbound.body)
    ) {
      user = await updateUser(user.id, { activeFlow: "match_creation" });
    }

    const pending = await tryResolvePendingFriend(user, inbound.body);
    replyBody = await runPadelAssistantAgent(user, inbound.body);
  }

  const outbound = replyBody ?? messages.unknownCommand;
  await sendWhatsAppMessage(user.id, outbound);
  return outbound;
}
