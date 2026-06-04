import {
  findPlayerByRef,
  findUserById,
  getDatabase,
} from "~/lib/db.server";
import { buildFriendInviteContent } from "~/lib/friend-invite-message.server";
import {
  displayFriendName,
  findUserForPlayerPhone,
} from "~/lib/friend-name.server";
import { findOptedInUserForPhone } from "~/lib/friend-invite.server";
import { formatPersonName } from "~/lib/person-name";
import type { Player } from "~/types/domain";

export type FavoritePlayerView = {
  ref: string;
  name: string;
  phone: string;
  isAppUser: boolean;
  optedIn: boolean;
  /** wa.me link to the friend's chat with invite text pre-filled */
  inviteUrl: string | null;
  /** Message the user forwards to their friend */
  inviteForwardText: string | null;
};

function inviteFieldsForPlayer(
  player: { name: string; phone: string },
  inviterName: string,
  twilioWhatsAppFrom: string | undefined,
  optedIn: boolean,
): Pick<FavoritePlayerView, "inviteUrl" | "inviteForwardText"> {
  if (optedIn) {
    return { inviteUrl: null, inviteForwardText: null };
  }
  const content = buildFriendInviteContent({
    friendName: player.name,
    friendPhone: player.phone,
    inviterName,
    twilioWhatsAppFrom,
  });
  if (!content) {
    return { inviteUrl: null, inviteForwardText: null };
  }
  return {
    inviteUrl: content.shareUrl,
    inviteForwardText: content.forwardText,
  };
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
  const inviterName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: "Ik",
  });

  const players: FavoritePlayerView[] = [];

  for (const ref of user.favoritePlayerRefs) {
    const player: Player | undefined =
      (await findPlayerByRef(ref)) ??
      db.players.find((p) => p.ref === ref);

    if (!player) {
      const name = displayFriendName(
        user.favoriteNames,
        ref,
        undefined,
        db.users,
        "Onbekende speler",
      );
      const invite = inviteFieldsForPlayer(
        { name, phone: ref },
        inviterName,
        twilioWhatsAppFrom,
        Boolean(findOptedInUserForPhone(db.users, ref)),
      );
      players.push({
        ref,
        name,
        phone: ref,
        isAppUser: false,
        optedIn: false,
        ...invite,
      });
      continue;
    }

    const matchedUser = findUserForPlayerPhone(db.users, player.phone);
    const optedIn = matchedUser?.optedIn ?? false;
    const name = displayFriendName(
      user.favoriteNames,
      player.ref,
      player,
      db.users,
      "Onbekende speler",
    );
    const invite = inviteFieldsForPlayer(
      { name, phone: player.phone },
      inviterName,
      twilioWhatsAppFrom,
      optedIn,
    );

    players.push({
      ref: player.ref,
      name,
      phone: player.phone,
      isAppUser: Boolean(matchedUser),
      optedIn,
      ...invite,
    });
  }

  return { ok: true, players };
}
