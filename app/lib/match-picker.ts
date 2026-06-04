import type { PadelLevel } from "~/types/domain";

export type MatchPickerPlayer = {
  ref: string;
  name: string;
  level: PadelLevel | null;
};

/** Three maatje slots on the court (excl. organizer). */
export type MaatjeSlots = [string | null, string | null, string | null];

export const MAATJE_SLOT_COUNT = 3;
export const MAX_COURT_SLOTS = 4;

/** Organizer + all three maatje slots filled — no one left to invite. */
export function isMaatjeCourtFull(slots: MaatjeSlots): boolean {
  return slots.every((ref) => ref !== null);
}
