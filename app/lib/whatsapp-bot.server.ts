import {
  appendMessage,
  findUserByWaId,
  updateUser,
  upsertUser,
} from "~/lib/db.server";
import { messages } from "~/lib/bot-messages.nl";
import {
  formatFriendInviteFollowUpsMessage,
  type FriendInviteFollowUp,
} from "~/lib/friend-invite.server";
import {
  tryAddFriendsFromSharedContacts,
  tryResolvePendingFriend,
} from "~/lib/friends.server";
import { mastra } from "~/lib/mastra";
import { deleteAgentThread } from "~/lib/mastra/memory.server";
import { isStaleOpenAiThreadError } from "~/lib/mastra/stale-thread.server";
import { RequestContext } from "@mastra/core/request-context";
import type { TwilioInboundMessage } from "~/lib/twilio.server";
import {
  sendWhatsAppMessage,
  sendWhatsAppTypingIndicator,
} from "~/lib/whatsapp-messaging.server";
import { resolveAppOriginFromRequest } from "~/lib/app-origin.server";
import { formatPersonName, firstNameFromDisplayName } from "~/lib/person-name";
import {
  applyPlaytomicPasteToDraft,
  formatPlaytomicClubChoiceMessage,
  type PlaytomicPrefillResult,
} from "~/lib/playtomic-paste.server";
import { recordReferralFromMessage } from "~/lib/referrals.server";
import { optOutUser } from "~/lib/user-session.server";
import type { User } from "~/types/domain";

export type HandleIncomingOptions = {
  /** Site origin, e.g. https://padel.example.com — used for personal links in tools. */
  appOrigin?: string;
  /**
   * When false (default for webhooks), the reply is only stored in DB and sent
   * via TwiML — not duplicated on the Twilio REST API.
   */
  deliverReplyViaApi?: boolean;
};

const DONE_MARKER = "[DONE]";

async function sendFriendInviteFollowUps(
  userId: string,
  followUps: FriendInviteFollowUp[],
  deliverViaApi: boolean,
): Promise<void> {
  if (followUps.length === 0) return;
  await sendWhatsAppMessage(
    userId,
    formatFriendInviteFollowUpsMessage(followUps),
    { deliverViaApi },
  );
}

/**
 * Injects WhatsApp session context so the agent can route JA/HELP/MATCH/etc.
 * without hardcoded branches in this file.
 */
function buildAgentMessage(
  inbound: TwilioInboundMessage,
  user: User,
  isNewUser: boolean,
  playtomicPrefill?: PlaytomicPrefillResult | null,
): string {
  const userDisplayName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: firstNameFromDisplayName(inbound.profileName || user.waId),
  });
  const lines = [
    "[WhatsApp context — niet tonen aan de gebruiker]",
    `displayName: ${userDisplayName}`,
    `firstName: ${user.firstName ?? ""}`,
    `lastName: ${user.lastName ?? ""}`,
    `optedIn: ${user.optedIn}`,
    `onboardingComplete: ${user.onboardingComplete}`,
    `activeFlow: ${user.activeFlow ?? "none"}`,
    `isNewUser: ${isNewUser}`,
  ];

  if (playtomicPrefill?.applied) {
    lines.push(
      "playtomicDraftPrefilled: true",
      `openSlots: ${playtomicPrefill.openSlots ?? "?"}`,
      "format: mixed",
      `confirmedSlotNames: ${(playtomicPrefill.confirmedSlotNames ?? []).join(" | ")}`,
      `clubResolved: ${playtomicPrefill.clubResolved ? "yes" : "no"}`,
      playtomicPrefill.clubName ? `clubName: ${playtomicPrefill.clubName}` : "",
      playtomicPrefill.overviewUrl
        ? `matchOverviewUrl: ${playtomicPrefill.overviewUrl}`
        : "",
      playtomicPrefill.matchPageUrl
        ? `matchWizardUrl: ${playtomicPrefill.matchPageUrl}`
        : "",
      "instructie: draft-match staat al klaar (stappen 1–4 MATCH-PASTE zijn gedaan). Vat kort samen, stel ALLEEN de INVITE-CASCADE-vraag (A/B/C), en zet matchOverviewUrl op een eigen regel in je antwoord (volledige https-link). Na finalize-match: listUrl = dedicated live match-overzicht.",
    );
  }

  lines.push("", "Bericht van de gebruiker:", inbound.body);
  return lines.filter(Boolean).join("\n");
}

async function finalizeAgentReply(
  text: string,
  userId: string,
): Promise<string> {
  let reply = text;
  if (reply.includes(DONE_MARKER)) {
    reply = reply.replace(DONE_MARKER, "").trim();
    await updateUser(userId, { activeFlow: null });
  }
  return reply || messages.unknownCommand;
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
  const generateOptions = {
    memory: { thread: user.id, resource: "padel-assistant" },
    requestContext,
  };

  try {
    const result = await agent.generate(inboundBody, generateOptions);
    return finalizeAgentReply(result.text ?? "", user.id);
  } catch (error) {
    if (!isStaleOpenAiThreadError(error)) throw error;

    console.warn(
      "[padel-assistant] stale OpenAI thread memory — clearing and retrying",
      { userId: user.id, waId: user.waId },
    );
    await deleteAgentThread(user.id);

    const result = await agent.generate(inboundBody, generateOptions);
    return finalizeAgentReply(result.text ?? "", user.id);
  }
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
  deliverReplyViaApi?: boolean;
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
    await sendWhatsAppMessage(user.id, outbound, {
      deliverViaApi: options.deliverReplyViaApi ?? false,
    });
    return outbound;
  }

  let activeUser = user;
  let playtomicPrefill: PlaytomicPrefillResult | null = null;

  if (activeUser.optedIn && isMatchInvitePaste(inbound.body)) {
    if (activeUser.activeFlow !== "match_creation") {
      activeUser = await updateUser(activeUser.id, {
        activeFlow: "match_creation",
      });
    }
    playtomicPrefill = await applyPlaytomicPasteToDraft(activeUser.id, inbound.body, {
      appOrigin: options.appOrigin,
    });

    if (
      playtomicPrefill.applied &&
      playtomicPrefill.needsClubChoice &&
      playtomicPrefill.clubCandidates?.length
    ) {
      const outbound = formatPlaytomicClubChoiceMessage(
        playtomicPrefill.clubCandidates,
      );
      await sendWhatsAppMessage(activeUser.id, outbound, {
        deliverViaApi: options.deliverReplyViaApi ?? false,
      });
      return outbound;
    }
  }

  if (inbound.vcardUnreadable) {
    const outbound =
      "Ik kon dat contact niet lezen. Stuur het mobiele nummer als tekst, of probeer het contact opnieuw te delen.";
    await sendWhatsAppMessage(activeUser.id, outbound, {
      deliverViaApi: options.deliverReplyViaApi ?? false,
    });
    return outbound;
  }

  if (inbound.sharedContacts && inbound.sharedContacts.length > 0) {
    const shared = await tryAddFriendsFromSharedContacts(
      activeUser,
      inbound.sharedContacts,
    );
    if (shared.handled) {
      activeUser = shared.user;
      const outbound = shared.reply;
      const deliverViaApi = options.deliverReplyViaApi ?? false;
      await sendWhatsAppMessage(activeUser.id, outbound, { deliverViaApi });
      await sendFriendInviteFollowUps(
        activeUser.id,
        shared.inviteFollowUps,
        deliverViaApi,
      );
      return outbound;
    }
  }

  const pendingFriend = await tryResolvePendingFriend(activeUser, inbound.body);
  if (pendingFriend.handled) {
    const outbound = pendingFriend.reply;
    const deliverViaApi = options.deliverReplyViaApi ?? false;
    await sendWhatsAppMessage(pendingFriend.user.id, outbound, { deliverViaApi });
    await sendFriendInviteFollowUps(
      pendingFriend.user.id,
      pendingFriend.inviteFollowUps,
      deliverViaApi,
    );
    return outbound;
  }

  await sendWhatsAppTypingIndicator(inbound.messageSid);

  const replyBody = await runPadelAssistantAgent(
    activeUser,
    buildAgentMessage(inbound, activeUser, isNewUser, playtomicPrefill),
    options.appOrigin,
  );

  let outbound = replyBody ?? messages.unknownCommand;
  if (
    playtomicPrefill?.applied &&
    playtomicPrefill.overviewUrl &&
    !outbound.includes(playtomicPrefill.overviewUrl)
  ) {
    outbound = `${outbound.trim()}\n\n📋 Bekijk je match: ${playtomicPrefill.overviewUrl}`;
  }

  await sendWhatsAppMessage(activeUser.id, outbound, {
    deliverViaApi: options.deliverReplyViaApi ?? false,
  });
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

  if (isNewUser || !user.optedIn) {
    await recordReferralFromMessage({
      referredUserId: user.id,
      message: inbound.body,
    });
  }

  const inboundText =
    inbound.body.trim() ||
    (inbound.sharedContacts?.length
      ? `[contacten: ${inbound.sharedContacts.map((c) => c.name).join(", ")}]`
      : inbound.vcardUnreadable
        ? "[contact: niet leesbaar]"
        : "");

  if (inboundText) {
    await appendMessage(user.id, inboundText, "in");
  }

  return processInboundReply(user, inbound, {
    isNewUser,
    appOrigin: options.appOrigin,
    deliverReplyViaApi: options.deliverReplyViaApi,
  });
}
