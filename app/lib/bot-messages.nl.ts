export const messages = {
  welcome: (name: string) =>
    `Hoi ${name}! Welkom bij Zin in Padel. Antwoord met JA om te starten.`,

  optInConfirmed: `Top, je bent aangemeld 🎾

Vertel gerust over jezelf: je padelniveau (1–7), met wie je speelt (naam + mobiel nummer), in welke clubs, en hoe je wilt matchen.`,

  friendsStart:
    "Welke vriend wil je toevoegen? Geef naam en mobiel nummer (bv. Pascal 0470123456).",

  optInRequired:
    "Antwoord eerst met JA om verder te gaan. Typ STOP om je later af te melden.",

  optOutConfirmed:
    "Je bent afgemeld. Je ontvangt geen berichten meer. Antwoord met JA om je opnieuw aan te melden.",

  help: `Beschikbare commando's:
• JA — aanmelden / profiel opnieuw starten
• FRIENDS — vriend toevoegen
• MATCH — een match plannen (of plak een Playtomic-uitnodiging)
• STOP — afmelden
• HELP — dit overzicht`,

  matchStartFresh: (newMatchUrl?: string) =>
    newMatchUrl
      ? `Top! Plan je match online:\n${newMatchUrl}\n\nOf geef hier datum, uur en club (of plak een Playtomic-bericht) — dan doen we het via WhatsApp.`
      : "Top, laten we een match plannen. Geef datum, uur en club, of plak een Playtomic-bericht.",

  unknownCommand:
    "Sorry, dat begrijp ik niet. Typ HELP voor een overzicht van commando's.",
} as const;
