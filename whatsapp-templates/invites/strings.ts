import type { FiringPhase } from "~/lib/cascade/types";

/** Opener line per cascade phase — `{{…}}` placeholders match Twilio variable keys. */
export const INVITE_OPENERS: Record<FiringPhase, string> = {
  1: "Hey {{firstName}}! {{organiserFullName}} nodigt je uit voor een padelmatch.",
  2: "Padelmatch: {{organiserFullName}} zoekt nog spelers op jouw niveau in {{clubName}}.",
  3: "Padelmatch: {{organiserFullName}} zoekt nog spelers in {{clubName}}. Zin om mee te doen?",
};

export function slotsLabel(openSlots: number): string {
  if (openSlots === 1) return "Nog 1 plek vrij";
  return `Nog ${openSlots} plekken vrij`;
}
