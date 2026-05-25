export const messages = {
  welcome: (name: string) =>
    `Hoi ${name}! Welkom bij Zin in Padel. Antwoord met JA om te starten.`,

  optInConfirmed: `Top, je bent aangemeld 🎾

Vertel gerust over jezelf: je padelniveau (p50, p100, p200, p300, p400, p500, p700, p1000), met wie je speelt (naam + mobiel nummer), in welke clubs, en hoe je wilt matchen.`,

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
      ? `Leuk! Zo plan je een match 🎾

1) Online (overzichtelijk, alles op één scherm):
${newMatchUrl}

2) Hier in WhatsApp — ik help je stap voor stap.

Heb je al een baan gereserveerd (bv. via Playtomic)?
→ Plak het uitnodigingsbericht hier. Dan zetten we datum, club en spelers klaar en kunnen we meteen mensen uitnodigen.

Heb je nog geen baan?
→ Zeg wanneer je wil spelen; daarna kies je club en nodig je spelers uit.`
      : `Leuk! Laten we een match plannen 🎾

Heb je al een baan gereserveerd (bv. via Playtomic)?
→ Plak het uitnodigingsbericht hier. Dan zetten we alles klaar en kunnen we meteen mensen uitnodigen.

Heb je nog geen baan?
→ Geef datum, uur en club, of zeg wanneer je wil spelen.`,

  profileCompleteFromWeb: (firstName: string, newMatchUrl?: string) => {
    const greeting = firstName ? `Top ${firstName}` : "Top";
    if (newMatchUrl) {
      return `${greeting}, je profiel staat klaar! 🎾

Plan een match via deze link:
${newMatchUrl}

Of typ MATCH om hier verder te gaan.`;
    }
    return `${greeting}, je profiel staat klaar! 🎾 Typ MATCH om een wedstrijd te plannen.`;
  },

  unknownCommand:
    "Sorry, dat begrijp ik niet. Typ HELP voor een overzicht van commando's.",
} as const;
