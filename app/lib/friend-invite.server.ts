import {
  buildFriendInviteContent,
  type FriendInviteContent,
} from "~/lib/friend-invite-message.server";
import { findUserById, getDatabase } from "~/lib/db.server";
import { formatPersonName } from "~/lib/person-name";
import { phonesEquivalent } from "~/lib/phone-match.server";
import type { User } from "~/types/domain";

export type { FriendInviteContent } from "~/lib/friend-invite-message.server";
export {
  buildFriendInviteContent,
  buildFriendInviteForwardText,
  buildFriendInviteWhatsAppUrl,
} from "~/lib/friend-invite-message.server";

export type FriendInviteFollowUp = FriendInviteContent & {
  friendName: string;
};

export function findOptedInUserForPhone(
  users: User[],
  playerPhone: string,
): User | undefined {
  return users.find(
    (u) =>
      u.optedIn &&
      (phonesEquivalent(playerPhone, u.phone) ||
        phonesEquivalent(playerPhone, u.waId)),
  );
}

export async function isPlayerOptedIn(phone: string): Promise<boolean> {
  const db = await getDatabase();
  return Boolean(findOptedInUserForPhone(db.users, phone));
}

export async function buildFriendInviteFollowUp(input: {
  inviterUserId: string;
  friendName: string;
  friendPhone: string;
  twilioWhatsAppFrom: string | undefined;
}): Promise<FriendInviteFollowUp | null> {
  if (await isPlayerOptedIn(input.friendPhone)) return null;

  const inviter = await findUserById(input.inviterUserId);
  if (!inviter) return null;

  const inviterName = formatPersonName({
    firstName: inviter.firstName,
    lastName: inviter.lastName,
    profileName: inviter.profileName,
    fallback: "Ik",
  });

  const content = buildFriendInviteContent({
    friendName: input.friendName,
    friendPhone: input.friendPhone,
    inviterName,
    twilioWhatsAppFrom: input.twilioWhatsAppFrom,
  });
  if (!content) return null;

  return {
    friendName: input.friendName.trim() || "je vriend",
    ...content,
  };
}

/** Second WhatsApp message to the organiser after adding a non-member friend. */
export function formatFriendInviteFollowUpMessage(
  followUp: FriendInviteFollowUp,
): string {
  const name = followUp.friendName;
  return `${name} gebruikt Zin in Padel nog niet.

Open WhatsApp om dit bericht naar ${name} te sturen — je hoeft alleen nog op Verzenden te tikken:
${followUp.shareUrl}

Zo luidt het bericht:
${followUp.forwardText}`;
}

export function formatFriendInviteFollowUpsMessage(
  followUps: FriendInviteFollowUp[],
): string {
  if (followUps.length === 1) {
    return formatFriendInviteFollowUpMessage(followUps[0]!);
  }

  const blocks = followUps.map((f) => {
    return `• ${f.friendName}
${f.shareUrl}`;
  });

  return `Deze vrienden gebruiken Zin in Padel nog niet. Stuur elk een persoonlijk bericht via WhatsApp (tik op de link, controleer de tekst, Verzenden):

${blocks.join("\n\n")}`;
}
