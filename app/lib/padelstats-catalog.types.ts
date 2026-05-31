export type PadelstatsMemberHit = {
  id: number;
  name: string;
  gender: string;
  currentRank: number;
  clubId: string | null;
  clubName: string | null;
  /** Formatted level, e.g. P400 */
  rankLabel: string | null;
  label: string;
};
