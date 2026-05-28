import { buildBotOnboardingUrl } from "~/lib/bot-onboarding.server";

export type FriendInviteContent = {
  forwardText: string;
  shareUrl: string;
};

/** Text the organiser forwards to a friend who is not on Zin in Padel yet. */
export function buildFriendInviteForwardText(input: {
  friendName: string;
  inviterName: string;
  botOnboardingUrl: string | null;
}): string {
  const friend = input.friendName.trim() || "daar";
  const inviter = input.inviterName.trim() || "Ik";
  const lines = [
    `Hoi ${friend}! ${inviter} gebruikt Zin in Padel om padelwedstrijden te regelen via WhatsApp 🎾`,
    "",
    "Wil je ook meedoen? Stuur JA in een chat met onze bot:",
  ];
  if (input.botOnboardingUrl) {
    lines.push(input.botOnboardingUrl);
  } else {
    lines.push("Zoek ons Zin in Padel-nummer in WhatsApp en stuur: JA");
  }
  return lines.join("\n");
}

function phoneToWaMeDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 ? digits : null;
}

/** Opens WhatsApp to the friend's chat with the invite message pre-filled. */
export function buildFriendInviteWhatsAppUrl(
  friendPhone: string,
  forwardText: string,
): string | null {
  const digits = phoneToWaMeDigits(friendPhone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(forwardText)}`;
}

export function buildFriendInviteContent(input: {
  friendName: string;
  friendPhone: string;
  inviterName: string;
  twilioWhatsAppFrom: string | undefined;
}): FriendInviteContent | null {
  const botUrl = buildBotOnboardingUrl(input.twilioWhatsAppFrom);
  const forwardText = buildFriendInviteForwardText({
    friendName: input.friendName,
    inviterName: input.inviterName,
    botOnboardingUrl: botUrl,
  });
  const shareUrl = buildFriendInviteWhatsAppUrl(
    input.friendPhone,
    forwardText,
  );
  if (!shareUrl) return null;
  return { forwardText, shareUrl };
}
