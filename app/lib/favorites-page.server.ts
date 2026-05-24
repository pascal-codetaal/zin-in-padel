import {
  findPlayerByRef,
  findUserById,
  getDatabase,
} from "~/lib/db.server";
import { buildBotOnboardingUrl } from "~/lib/bot-onboarding.server";
import { phonesEquivalent } from "~/lib/phone-match.server";
import type { Player, User } from "~/types/domain";

export type FavoritePlayerView = {
  ref: string;
  name: string;
  phone: string;
  isAppUser: boolean;
  optedIn: boolean;
  inviteUrl: string | null;
};

function findUserForPlayerPhone(
  users: User[],
  playerPhone: string,
): User | undefined {
  return users.find(
    (u) =>
      phonesEquivalent(playerPhone, u.phone) ||
      phonesEquivalent(playerPhone, u.waId),
  );
}

export async function getFavoritePlayersForUser(
  userId: string,
  twilioWhatsAppFrom: string | undefined,
): Promise<
  | { ok: true; players: FavoritePlayerView[] }
  | { ok: false; error: "user_not_found" }
> {
  const user = await findUserById(userId);
  if (!user) return { ok: false, error: "user_not_found" };

  const db = await getDatabase();
  const botInviteUrl = buildBotOnboardingUrl(twilioWhatsAppFrom);

  const players: FavoritePlayerView[] = [];

  for (const ref of user.favoritePlayerRefs) {
    const player: Player | undefined =
      (await findPlayerByRef(ref)) ??
      db.players.find((p) => p.ref === ref);

    if (!player) {
      players.push({
        ref,
        name: "Onbekende speler",
        phone: ref,
        isAppUser: false,
        optedIn: false,
        inviteUrl: botInviteUrl,
      });
      continue;
    }

    const matchedUser = findUserForPlayerPhone(db.users, player.phone);

    players.push({
      ref: player.ref,
      name: player.name,
      phone: player.phone,
      isAppUser: Boolean(matchedUser),
      optedIn: matchedUser?.optedIn ?? false,
      inviteUrl: matchedUser?.optedIn ? null : botInviteUrl,
    });
  }

  return { ok: true, players };
}
