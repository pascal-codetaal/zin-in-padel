export const messages = {
  welcome: (name: string) =>
    `Hoi ${name}! Welkom bij Zin in Padel. Antwoord met JA om updates over padel te ontvangen.`,
  optInConfirmed:
    "Top! Je bent aangemeld 🎾 Laten we eerst je padel-maatjes verzamelen. Met wie speel je vaak? Geef naam + mobiel nummer.",
  maatjesStart:
    "Top, laten we je maatjeslijst bijwerken! Wie wil je toevoegen? Geef naam + mobiel nummer.",
  optInRequired:
    "Antwoord eerst met JA om verder te gaan. Typ STOP om je later af te melden.",
  optOutConfirmed:
    "Je bent afgemeld. Je ontvangt geen berichten meer. Antwoord met JA om je opnieuw aan te melden.",
  help: "Beschikbare commando's:\n• JA — aanmelden voor berichten\n• MAATJES — favoriete medespelers toevoegen\n• STOP — afmelden\n• HELP — dit overzicht",
  unknownCommand:
    "Sorry, dat begrijp ik niet. Typ HELP voor een overzicht van commando's.",
} as const;
