import { formatPersonName } from "~/lib/person-name";
import { phonesEquivalent } from "~/lib/phone-match.server";
import { resolveFavoriteName } from "~/types/domain";
import type { Player, User } from "~/types/domain";

/** The registered user that owns this phone, if any (regardless of opt-in). */
export function findUserForPlayerPhone(
  users: User[],
  playerPhone: string,
): User | undefined {
  return users.find(
    (u) =>
      phonesEquivalent(playerPhone, u.phone) ||
      phonesEquivalent(playerPhone, u.waId),
  );
}

/**
 * Authoritative non-nickname name for a player ref. A registered owner's real
 * name wins over the `Player` stub — the stub may hold a stale label a
 * friend-adder once typed (and, before the nickname split, overwrote). Falls
 * back to the stub, then `fallback`.
 */
export function canonicalRefName(
  ref: string,
  player: Pick<Player, "name" | "phone"> | undefined,
  users: User[],
  fallback: string,
): string {
  const owner = findUserForPlayerPhone(users, player?.phone ?? ref);
  if (owner) {
    return formatPersonName({
      firstName: owner.firstName,
      lastName: owner.lastName,
      profileName: owner.profileName,
      fallback: player?.name ?? fallback,
    });
  }
  return player?.name ?? fallback;
}

/**
 * Friend display name from a viewer's perspective: their own nickname wins,
 * else the canonical owner/stub name. The single source of truth for how a
 * favorite/invitee renders across the app.
 */
export function displayFriendName(
  viewerFavoriteNames: Record<string, string>,
  ref: string,
  player: Pick<Player, "name" | "phone"> | undefined,
  users: User[],
  fallback: string,
): string {
  return resolveFavoriteName(
    viewerFavoriteNames,
    ref,
    canonicalRefName(ref, player, users, fallback),
    fallback,
  );
}
