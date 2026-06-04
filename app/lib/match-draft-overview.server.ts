import { getClubsByIds } from "~/lib/clubs.server";
import { getDatabase } from "~/lib/db.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import {
  formatMatchFormat,
  formatPadelLevel,
  openSlotsOf,
  type Match,
  type PadelLevel,
} from "~/types/domain";

export type DraftOverviewInvitedPlayer = {
  ref: string;
  name: string;
};

export type DraftOverviewData = {
  scheduledAt: string | null;
  durationMinutes: number;
  format: Match["format"];
  totalSlots: number;
  confirmedSlotNames: string[];
  openSlots: number;
  fallbackToLevelRange: boolean;
  fallbackLevelMin: PadelLevel | null;
  fallbackLevelMax: PadelLevel | null;
  fallbackLevelDelayMinutes: number;
  fallbackToEveryone: boolean;
  fallbackEveryoneDelayMinutes: number;
  clubs: { id: string; name: string; city: string }[];
  invitedPlayers: DraftOverviewInvitedPlayer[];
  whenLabel: string;
  formatLabel: string;
  cascadeLabel: string;
  playersLabel: string;
  openSlotsLabel: string;
  invitedLabel: string;
};

export function formatCascadeLabel(draft: {
  fallbackToLevelRange: boolean;
  fallbackLevelMin: PadelLevel | null;
  fallbackLevelMax: PadelLevel | null;
  fallbackLevelDelayMinutes: number;
  fallbackToEveryone: boolean;
  fallbackEveryoneDelayMinutes: number;
}): string {
  const parts: string[] = ["Vrienden (nu)"];
  if (draft.fallbackToLevelRange) {
    const min = draft.fallbackLevelMin
      ? formatPadelLevel(draft.fallbackLevelMin)
      : "?";
    const max = draft.fallbackLevelMax
      ? formatPadelLevel(draft.fallbackLevelMax)
      : "?";
    parts.push(`P ${min}–${max} (+${draft.fallbackLevelDelayMinutes} min)`);
  }
  if (draft.fallbackToEveryone) {
    parts.push(`Iedereen (+${draft.fallbackEveryoneDelayMinutes} min)`);
  }
  if (parts.length === 1) {
    return "Nog te kiezen via WhatsApp (A/B/C)";
  }
  return parts.join(" → ");
}

export async function loadDraftOverviewData(
  draft: Match,
): Promise<DraftOverviewData> {
  const [clubs, db] = await Promise.all([
    getClubsByIds(draft.clubIds),
    getDatabase(),
  ]);

  const invitedPlayers = draft.invitedFriendRefs.map((ref) => {
    const p = db.players.find((player) => player.ref === ref);
    return p
      ? { ref: p.ref, name: p.name }
      : { ref, name: "Onbekende speler" };
  });

  const openSlots = openSlotsOf(draft);
  const cascadeLabel = formatCascadeLabel(draft);

  return {
    scheduledAt: draft.scheduledAt,
    durationMinutes: draft.durationMinutes,
    format: draft.format,
    totalSlots: draft.totalSlots,
    confirmedSlotNames: draft.confirmedSlotNames,
    openSlots,
    fallbackToLevelRange: draft.fallbackToLevelRange,
    fallbackLevelMin: draft.fallbackLevelMin,
    fallbackLevelMax: draft.fallbackLevelMax,
    fallbackLevelDelayMinutes: draft.fallbackLevelDelayMinutes,
    fallbackToEveryone: draft.fallbackToEveryone,
    fallbackEveryoneDelayMinutes: draft.fallbackEveryoneDelayMinutes,
    clubs: clubs.map((c) => ({ id: c.id, name: c.name, city: c.city })),
    invitedPlayers,
    whenLabel: draft.scheduledAt
      ? `${formatScheduledAt(draft.scheduledAt)} · ${draft.durationMinutes} min`
      : "—",
    formatLabel: formatMatchFormat(draft.format),
    cascadeLabel,
    playersLabel:
      draft.confirmedSlotNames.length === 0
        ? "—"
        : draft.confirmedSlotNames.join(", "),
    openSlotsLabel:
      openSlots === 0
        ? `${draft.totalSlots}/${draft.totalSlots} (volzet)`
        : `${draft.totalSlots - openSlots}/${draft.totalSlots} ingevuld · ${openSlots} open`,
    invitedLabel:
      invitedPlayers.length === 0
        ? "Nog niemand geselecteerd"
        : `${invitedPlayers.length} vrienden (${invitedPlayers
            .map((p) => p.name)
            .slice(0, 4)
            .join(", ")}${invitedPlayers.length > 4 ? "…" : ""})`,
  };
}
