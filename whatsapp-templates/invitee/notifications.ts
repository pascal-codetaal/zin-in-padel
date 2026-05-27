export function formatRemovedFromMatchNotice(args: {
  greeting: string;
  clubName: string;
  when: string;
}): string {
  const { greeting, clubName, when } = args;
  return [
    `${greeting},`,
    ``,
    `De organisator heeft je uit de padelmatch bij ${clubName} (${when}) gehaald. Je hoeft niet meer te komen.`,
    ``,
    `Reply STOP om geen berichten meer te ontvangen.`,
  ].join("\n");
}

export function formatMatchCancelledNotice(args: {
  greeting: string;
  clubName: string;
  when: string;
}): string {
  const { greeting, clubName, when } = args;
  return [
    `${greeting},`,
    ``,
    `De padelmatch bij ${clubName} (${when}) is geannuleerd door de organisator.`,
    ``,
    `Reply STOP om geen berichten meer te ontvangen.`,
  ].join("\n");
}
