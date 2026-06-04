export function formatRemovedFromMatchNotice(args: {
  greeting: string;
  clubName: string;
  when: string;
}): string {
  const { greeting, clubName, when } = args;
  return [
    `${greeting},`,
    ``,
    `De organisator heeft de spelerslijst aangepast: je staat niet meer op de padelmatch bij ${clubName} (${when}).`,
    `Je hoeft dus niets meer te doen voor deze match.`,
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
    `Je hoeft dus niet meer te komen.`,
    ``,
    `Reply STOP om geen berichten meer te ontvangen.`,
  ].join("\n");
}
