import {
  addFavoriteToUser,
  clearPendingFriend,
  findUserById,
  setPendingFriend,
  upsertPlayer,
} from "~/lib/db.server";
import {
  buildFriendInviteFollowUp,
  type FriendInviteFollowUp,
} from "~/lib/friend-invite.server";
import { parsePhoneFromText } from "~/lib/phone.server";
import type { User } from "~/types/domain";
import { playerRefFromPhone } from "~/types/domain";

async function inviteFollowUpForNewFriend(
  userId: string,
  name: string,
  phone: string,
  alreadyFavorite: boolean,
): Promise<FriendInviteFollowUp | null> {
  if (alreadyFavorite) return null;
  return buildFriendInviteFollowUp({
    inviterUserId: userId,
    friendName: name,
    friendPhone: phone,
    twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM,
  });
}

type FriendHandledResult = {
  handled: true;
  reply: string;
  user: User;
  inviteFollowUps: FriendInviteFollowUp[];
};

export function phonePrompt(name: string): string {
  return `Welk mobiel nummer heeft ${name}? Stuur het nummer (bv. 0470123456).`;
}

export async function addFriend(
  userId: string,
  name: string,
  phoneRaw: string,
): Promise<
  | { ok: true; name: string; phone: string; alreadyFavorite: boolean }
  | { ok: false; error: "invalid_phone" | "user_not_found" }
> {
  const user = await findUserById(userId);
  if (!user) return { ok: false, error: "user_not_found" };

  const phone = parsePhoneFromText(phoneRaw);
  if (!phone) return { ok: false, error: "invalid_phone" };

  const ref = playerRefFromPhone(phone);
  const alreadyFavorite = user.favoritePlayerRefs.includes(ref);

  await upsertPlayer({ ref, name: name.trim(), phone });
  await addFavoriteToUser(userId, ref);
  await clearPendingFriend(userId);

  return { ok: true, name: name.trim(), phone, alreadyFavorite };
}

export async function stageFriendName(
  userId: string,
  name: string,
): Promise<{ message: string }> {
  await setPendingFriend(userId, { name: name.trim() });
  return { message: phonePrompt(name.trim()) };
}

function resolveSharedContactName(
  user: User,
  contact: { name: string; phone: string },
  total: number,
): string {
  if (user.pendingFriend && total === 1) {
    return user.pendingFriend.name.trim();
  }
  return contact.name.trim();
}

export async function tryAddFriendsFromSharedContacts(
  user: User,
  contacts: { name: string; phone: string }[],
): Promise<FriendHandledResult | { handled: false }> {
  if (contacts.length === 0) return { handled: false };

  const added: string[] = [];
  const duplicates: string[] = [];
  const inviteFollowUps: FriendInviteFollowUp[] = [];
  let skipped = 0;

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i]!;
    const name = resolveSharedContactName(user, contact, contacts.length);
    if (!name) {
      skipped += 1;
      continue;
    }

    const result = await addFriend(user.id, name, contact.phone);
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    if (result.alreadyFavorite) duplicates.push(result.name);
    else {
      added.push(`${result.name} (${result.phone})`);
      const followUp = await inviteFollowUpForNewFriend(
        user.id,
        result.name,
        result.phone,
        false,
      );
      if (followUp) inviteFollowUps.push(followUp);
    }
  }

  const updated = await findUserById(user.id);
  if (!updated) {
    return {
      handled: true,
      reply: "Er ging iets mis. Probeer opnieuw.",
      user,
      inviteFollowUps: [],
    };
  }

  if (added.length === 0 && duplicates.length === 0) {
    const pendingName = user.pendingFriend?.name;
    return {
      handled: true,
      reply: pendingName
        ? `Geen geldig nummer gevonden. ${phonePrompt(pendingName)}`
        : "Ik kon geen geldige contacten uit dat bericht halen. Stuur ze één voor één of als tekst met nummer.",
      user: updated,
      inviteFollowUps: [],
    };
  }

  const parts: string[] = [];
  if (added.length === 1) {
    parts.push(`${added[0]} toegevoegd.`);
  } else if (added.length > 1) {
    parts.push(`${added.length} vrienden toegevoegd:\n${added.map((a) => `• ${a}`).join("\n")}`);
  }
  if (duplicates.length > 0) {
    const dupLabel =
      duplicates.length === 1
        ? `${duplicates[0]} stond al in je lijst.`
        : `${duplicates.length} contacten stonden al in je lijst.`;
    parts.push(dupLabel);
  }
  if (skipped > 0) {
    parts.push(
      `${skipped} contact${skipped === 1 ? "" : "en"} overgeslagen (geen geldig nummer).`,
    );
  }
  return {
    handled: true,
    reply: parts.join("\n"),
    user: updated,
    inviteFollowUps,
  };
}

export async function tryResolvePendingFriend(
  user: User,
  body: string,
): Promise<FriendHandledResult | { handled: false }> {
  const pending = user.pendingFriend;
  if (!pending) return { handled: false };

  const result = await addFriend(user.id, pending.name, body);
  if (!result.ok) {
    return {
      handled: true,
      reply: `Dat lijkt geen geldig mobiel nummer. ${phonePrompt(pending.name)}`,
      user,
      inviteFollowUps: [],
    };
  }

  const updated = await findUserById(user.id);
  if (!updated) {
    return {
      handled: true,
      reply: "Er ging iets mis. Probeer opnieuw.",
      user,
      inviteFollowUps: [],
    };
  }

  const dup = result.alreadyFavorite ? " Die stond al in je vriendenlijst." : "";
  const followUp = await inviteFollowUpForNewFriend(
    user.id,
    result.name,
    result.phone,
    result.alreadyFavorite,
  );
  return {
    handled: true,
    reply: `${result.name} toegevoegd (${result.phone}).${dup}`,
    user: updated,
    inviteFollowUps: followUp ? [followUp] : [],
  };
}
