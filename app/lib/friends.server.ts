import {
  addFavoriteToUser,
  clearPendingFriend,
  findUserById,
  setPendingFriend,
  upsertPlayer,
} from "~/lib/db.server";
import { parsePhoneFromText } from "~/lib/phone.server";
import type { User } from "~/types/domain";
import { playerRefFromPhone } from "~/types/domain";

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

export async function tryResolvePendingFriend(
  user: User,
  body: string,
): Promise<{ handled: true; reply: string; user: User } | { handled: false }> {
  const pending = user.pendingFriend;
  if (!pending) return { handled: false };

  const result = await addFriend(user.id, pending.name, body);
  if (!result.ok) {
    return {
      handled: true,
      reply: `Dat lijkt geen geldig mobiel nummer. ${phonePrompt(pending.name)}`,
      user,
    };
  }

  const updated = await findUserById(user.id);
  if (!updated) {
    return {
      handled: true,
      reply: "Er ging iets mis. Probeer opnieuw.",
      user,
    };
  }

  const dup = result.alreadyFavorite ? " Die stond al in je vriendenlijst." : "";
  return {
    handled: true,
    reply: `${result.name} toegevoegd (${result.phone}).${dup}`,
    user: updated,
  };
}
