export type OrganiserNotifyContentVariablesInput = {
  /** Fully-rendered Dutch notice line (see `organiser/notify.ts`). */
  body: string;
  /** Organiser manage token; drives the `/match/{{2}}` CTA deep link. */
  matchToken: string;
};

/**
 * Numeric keys match Twilio Content variable placeholders {{1}}, {{2}}
 * in `organiser/twilio/organiser-notify.content.json`.
 */
export function buildOrganiserNotifyContentVariables(
  input: OrganiserNotifyContentVariablesInput,
): Record<string, string> {
  return {
    "1": input.body,
    "2": input.matchToken,
  };
}
