import { getClubsByIds } from "~/lib/clubs.server";
import { getDatabase } from "~/lib/db.server";
import { displayFriendName } from "~/lib/friend-name.server";
import { formatPersonName } from "~/lib/person-name";
import type {
  LiveMatchOverviewData,
  LiveMatchInvite,
  LiveMatchPlayer,
} from "~/components/match-live-overview";
import {
  acceptedPlayerRefsOf,
  formatPadelLevel,
  openSlotsOf,
  type Match,
  type User,
} from "~/types/domain";

export async function buildLiveMatchOverviewData(
  match: Match,
  viewer: User,
  selfPlayerRef: string | null,
): Promise<LiveMatchOverviewData> {
  const [clubs, db] = await Promise.all([
    getClubsByIds(match.clubIds),
    getDatabase(),
  ]);
  const playersByRef = new Map(db.players.map((p) => [p.ref, p]));
  const userByPlayerRef = new Map(
    db.users.map((user) => [user.phone.replace(/^whatsapp:/, ""), user]),
  );
  const viewerNames = new Set(
    [
      viewer.profileName,
      formatPersonName({
        firstName: viewer.firstName,
        lastName: viewer.lastName,
        profileName: viewer.profileName,
        fallback: "",
      }),
    ]
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
  const acceptedRoster: LiveMatchPlayer[] = acceptedPlayerRefsOf(match).map(
    (ref) => ({
      id: `accepted-${ref}`,
      name: displayFriendName(
        viewer.favoriteNames,
        ref,
        playersByRef.get(ref),
        db.users,
        ref,
      ),
      source: "accepted" as const,
      playerRef: ref,
      isSelf: ref === selfPlayerRef,
      level: userByPlayerRef.get(ref.replace(/^whatsapp:/, ""))?.level ?? null,
    }),
  );
  const confirmedRoster: LiveMatchPlayer[] = match.confirmedSlotNames.map(
    (name, index) => ({
      id: `confirmed-${index}-${name}`,
      name,
      source: "confirmed" as const,
      confirmedSlotName: name,
      level: viewerNames.has(name.trim().toLowerCase()) ? viewer.level : null,
    }),
  );
  const openSlots = openSlotsOf(match);
  const invites: LiveMatchInvite[] = [...match.invitedPlayers]
    .sort((a, b) => {
      if (a.cascadePhase !== b.cascadePhase) return a.cascadePhase - b.cascadePhase;
      return (a.sentAt ?? "").localeCompare(b.sentAt ?? "");
    })
    .map((invite) => ({
      id: `${invite.cascadePhase}-${invite.playerRef}`,
      name: displayFriendName(
        viewer.favoriteNames,
        invite.playerRef,
        playersByRef.get(invite.playerRef),
        db.users,
        invite.playerRef,
      ),
      status: invite.status,
      cascadePhase: invite.cascadePhase,
      sentAt: invite.sentAt,
      respondedAt: invite.respondedAt,
    }));
  const nextBatchLabel = getNextBatchLabel(match);
  const canInviteNextBatch =
    match.status === "open" && openSlots > 0 && nextBatchLabel !== null;

  return {
    id: match.id,
    scheduledAt: match.scheduledAt,
    durationMinutes: match.durationMinutes,
    format: match.format,
    status: match.status,
    totalSlots: match.totalSlots,
    openSlots,
    filledSlots: match.totalSlots - openSlots,
    players: [...confirmedRoster, ...acceptedRoster],
    clubs: clubs.map((c) => ({ id: c.id, name: c.name, city: c.city })),
    invites,
    cascade: {
      currentPhase: match.currentCascadePhase,
      nextCascadeAt: match.nextCascadeAt,
      canInviteNextBatch,
      nextBatchLabel,
    },
  };
}

function getNextBatchLabel(match: Match): string | null {
  if (match.currentCascadePhase < 2 && match.fallbackToLevelRange) {
    const min = match.fallbackLevelMin
      ? formatPadelLevel(match.fallbackLevelMin)
      : "?";
    const max = match.fallbackLevelMax
      ? formatPadelLevel(match.fallbackLevelMax)
      : "?";
    return `spelers op niveau ${min}-${max}`;
  }
  if (match.currentCascadePhase < 3 && match.fallbackToEveryone) {
    return "iedereen";
  }
  return null;
}
