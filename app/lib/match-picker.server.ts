import {
  findPlayerByRef,
  findUserById,
  getDatabase,
} from "~/lib/db.server";
import {
  MAATJE_SLOT_COUNT,
  MAX_COURT_SLOTS,
  type MaatjeSlots,
  type MatchPickerPlayer,
} from "~/lib/match-picker";
import {
  filterInvitableFriendRefs,
  findPlayerRefByFuzzyName,
  playerRefsOnCourtFromRoster,
} from "~/lib/match-roster.server";
import {
  displayFriendName,
  findUserForPlayerPhone,
} from "~/lib/friend-name.server";
import type { Player } from "~/types/domain";

export {
  filterInvitableFriendRefs,
  findPlayerRefByFuzzyName,
  playerRefsOnCourtFromRoster,
  resolveMaatjesInvitedRefs,
} from "~/lib/match-roster.server";

export type { MaatjeSlots, MatchPickerPlayer } from "~/lib/match-picker";
export { MAATJE_SLOT_COUNT, MAX_COURT_SLOTS } from "~/lib/match-picker";

/** Favorite players enriched with P-level when they are a PadelMatch user. */
export async function getMatchPickerPlayers(
  userId: string,
): Promise<MatchPickerPlayer[]> {
  const user = await findUserById(userId);
  if (!user) return [];

  const db = await getDatabase();
  const players: MatchPickerPlayer[] = [];

  for (const ref of user.favoritePlayerRefs) {
    const player: Player | undefined =
      (await findPlayerByRef(ref)) ?? db.players.find((p) => p.ref === ref);

    if (!player) {
      players.push({
        ref,
        name: displayFriendName(
          user.favoriteNames,
          ref,
          undefined,
          db.users,
          "Onbekende speler",
        ),
        level: null,
      });
      continue;
    }

    const matchedUser = findUserForPlayerPhone(db.users, player.phone);
    players.push({
      ref: player.ref,
      name: displayFriendName(
        user.favoriteNames,
        player.ref,
        player,
        db.users,
        "Onbekende speler",
      ),
      level: matchedUser?.level ?? null,
    });
  }

  return players;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Map draft confirmed names to three ordered court slots (after organizer). */
export function maatjeSlotsFromDraft(
  organizerName: string,
  slotNames: string[],
  players: MatchPickerPlayer[],
): MaatjeSlots {
  const orgKey = normalizeName(organizerName);
  const slots: MaatjeSlots = [null, null, null];
  let i = 0;
  for (const name of slotNames) {
    if (normalizeName(name) === orgKey) continue;
    if (i >= MAATJE_SLOT_COUNT) break;
    slots[i] = findPlayerRefByFuzzyName(name, players);
    i += 1;
  }
  return slots;
}

/** On-court refs for invite UI: fuzzy names + explicit court slot refs. */
export function onCourtRefsForInviteStep(input: {
  organizerName: string;
  confirmedSlotNames: string[];
  players: MatchPickerPlayer[];
  slotRefs: MaatjeSlots;
}): string[] {
  const fromSlots = input.slotRefs.filter((r): r is string => r !== null);
  return [
    ...playerRefsOnCourtFromRoster({
      organizerName: input.organizerName,
      confirmedSlotNames: input.confirmedSlotNames,
      players: input.players,
      extraRefs: fromSlots,
    }),
  ];
}

/** Build confirmedSlotNames: organizer + filled slots in order. */
export function buildConfirmedSlotNames(
  organizerName: string,
  slots: MaatjeSlots,
  players: MatchPickerPlayer[],
): string[] {
  const names: string[] = [organizerName.trim() || "Organisator"];
  for (const ref of slots) {
    if (!ref || names.length >= MAX_COURT_SLOTS) continue;
    const player = players.find((p) => p.ref === ref);
    if (player) names.push(player.name);
  }
  return names;
}

export function parseMaatjeSlotsForm(
  form: FormData,
  favoriteRefs: string[],
): MaatjeSlots {
  const allowed = new Set(favoriteRefs);
  const read = (key: string): string | null => {
    const raw = form.get(key)?.toString().trim() ?? "";
    if (!raw || !allowed.has(raw)) return null;
    return raw;
  };
  return [read("confirmedSlot_1"), read("confirmedSlot_2"), read("confirmedSlot_3")];
}

export function parseInvitedRefsForm(
  form: FormData,
  favoriteRefs: string[],
  onCourtRefs: Iterable<string>,
): string[] {
  const allowed = new Set(favoriteRefs);
  const onCourt = new Set(onCourtRefs);
  return form
    .getAll("invitedFriendRefs")
    .map((v) => v.toString())
    .filter((ref) => allowed.has(ref) && !onCourt.has(ref));
}

export async function applyConfirmedSlots(
  matchId: string,
  organizerName: string,
  players: MatchPickerPlayer[],
  slots: MaatjeSlots,
): Promise<void> {
  const { updateMatchDraft } = await import("~/lib/db.server");
  await updateMatchDraft(matchId, {
    confirmedSlotNames: buildConfirmedSlotNames(organizerName, slots, players),
    invitedFriendRefs: [],
  });
}

export async function applyInvitedRefs(
  matchId: string,
  invitedRefs: string[],
): Promise<void> {
  const { updateMatchDraft } = await import("~/lib/db.server");
  await updateMatchDraft(matchId, { invitedFriendRefs: invitedRefs });
}
