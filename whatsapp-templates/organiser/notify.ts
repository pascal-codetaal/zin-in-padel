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
