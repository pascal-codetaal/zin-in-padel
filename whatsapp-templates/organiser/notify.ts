export function formatInviteeAcceptedNotice(args: {
  firstName: string;
  clubName: string;
  when: string;
  matchUrl: string;
}): string {
  const { firstName, clubName, when, matchUrl } = args;
  return [
    `${firstName} doet mee met je padelmatch bij ${clubName} (${when}). 🎾`,
    ``,
    matchUrl,
  ].join("\n");
}

export function formatInviteeLeftNotice(args: {
  firstName: string;
  clubName: string;
  when: string;
  matchUrl: string;
}): string {
  const { firstName, clubName, when, matchUrl } = args;
  return [
    `${firstName} heeft zich uitgeschreven voor je padelmatch bij ${clubName} (${when}).`,
    `Er is opnieuw een plek vrij.`,
    ``,
    matchUrl,
  ].join("\n");
}

export function formatMatchFullNotice(args: {
  clubName: string;
  when: string;
  matchUrl: string;
}): string {
  const { clubName, when, matchUrl } = args;
  return [
    `Je padelmatch bij ${clubName} (${when}) is vol. 🎉`,
    `De cascade is automatisch gestopt.`,
    ``,
    matchUrl,
  ].join("\n");
}

export function formatCascadeExhaustedNotice(args: {
  clubName: string;
  when: string;
  openSlots: number;
  matchUrl: string;
}): string {
  const { clubName, when, openSlots, matchUrl } = args;
  return [
    `Je padelmatch bij ${clubName} (${when}) heeft nog ${openSlots} open ${
      openSlots === 1 ? "plek" : "plekken"
    }, maar de cascade is uitgeput.`,
    `Open de match om iemand handmatig toe te voegen of de match te annuleren.`,
    ``,
    matchUrl,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Single-line, URL-free variants for the Twilio Content {{1}} variable.     */
/*  Twilio rejects newlines inside content variables (error 21656), and the   */
/*  match link is supplied separately by the {{2}} CTA button, so these omit  */
/*  both the embedded URL and any line breaks.                                */
/* -------------------------------------------------------------------------- */

export function formatInviteeAcceptedLine(args: {
  firstName: string;
  clubName: string;
  when: string;
}): string {
  const { firstName, clubName, when } = args;
  return `${firstName} doet mee met je padelmatch bij ${clubName} (${when}). 🎾`;
}

export function formatInviteeLeftLine(args: {
  firstName: string;
  clubName: string;
  when: string;
}): string {
  const { firstName, clubName, when } = args;
  return `${firstName} heeft zich uitgeschreven voor je padelmatch bij ${clubName} (${when}). Er is opnieuw een plek vrij.`;
}

export function formatMatchFullLine(args: {
  clubName: string;
  when: string;
}): string {
  const { clubName, when } = args;
  return `Je padelmatch bij ${clubName} (${when}) is vol. 🎉 De cascade is automatisch gestopt.`;
}

export function formatCascadeExhaustedLine(args: {
  clubName: string;
  when: string;
  openSlots: number;
}): string {
  const { clubName, when, openSlots } = args;
  return (
    `Je padelmatch bij ${clubName} (${when}) heeft nog ${openSlots} open ` +
    `${openSlots === 1 ? "plek" : "plekken"}, maar de cascade is uitgeput. ` +
    `Open de match om iemand handmatig toe te voegen of de match te annuleren.`
  );
}
