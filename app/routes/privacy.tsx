export function meta() {
  return [
    { title: "Privacyverklaring | Zin in Padel" },
    {
      name: "description",
      content:
        "Privacyverklaring voor de wachtlijst en website van Zin in Padel.",
    },
  ];
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
        <a href="/" className="text-sm font-medium text-primary hover:underline">
          Terug naar Zin in Padel
        </a>

        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Privacyverklaring
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Laatst bijgewerkt: 4 juni 2026. Deze verklaring gaat over de
          wachtlijst en publieke website van Zin in Padel.
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Wie verwerkt je gegevens?
            </h2>
            <p className="mt-2">
              Zin in Padel verwerkt de gegevens die je invult op de wachtlijst.
              Voor vragen, inzage of verwijdering kan je mailen naar{" "}
              <a
                href="mailto:hallo@zin-in-padel.be"
                className="font-medium text-primary hover:underline"
              >
                hallo@zin-in-padel.be
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Welke gegevens bewaren we?
            </h2>
            <p className="mt-2">
              Voor de wachtlijst bewaren we je mobiel nummer, je geselecteerde
              Tennis & Padel Vlaanderen-profiel, je club als die beschikbaar is,
              en het moment waarop je toestemming gaf. We bewaren geen betaaldata
              via deze website.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Waarom verwerken we die gegevens?
            </h2>
            <p className="mt-2">
              We gebruiken je gegevens om je op de wachtlijst te zetten, je
              WhatsApp-nummer aan het juiste padelprofiel te koppelen en je te
              contacteren wanneer Zin in Padel voor jouw club beschikbaar komt.
              De grondslag is je toestemming bij het inschrijven.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Zoekfunctie voor TV-profielen
            </h2>
            <p className="mt-2">
              Tijdens het zoeken sturen we je zoekterm naar onze eigen server om
              overeenkomstige clubleden te tonen. De zoekresultaten komen uit
              geïmporteerde Tennis & Padel Vlaanderen-clubledeninformatie. We
              gebruiken deze zoekactie alleen om jou het juiste profiel te laten
              selecteren.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Delen we je gegevens?
            </h2>
            <p className="mt-2">
              We verkopen je gegevens niet. We gebruiken alleen technische
              dienstverleners die nodig zijn om de website, database en latere
              WhatsApp-communicatie te laten werken.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Hoe lang bewaren we ze?
            </h2>
            <p className="mt-2">
              We bewaren wachtlijstgegevens zolang de lancering en onboarding
              lopen, en verwijderen ze wanneer ze niet meer nodig zijn of wanneer
              je vraagt om ze te verwijderen.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Cookies en tracking
            </h2>
            <p className="mt-2">
              De huidige publieke homepage gebruikt geen marketingcookies,
              analytics-pixels of externe tracking. Als dat verandert, passen we
              deze verklaring en eventuele toestemmingsvragen aan.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Je rechten
            </h2>
            <p className="mt-2">
              Je kan je toestemming intrekken en vragen om inzage, correctie of
              verwijdering van je gegevens. Mail daarvoor naar{" "}
              <a
                href="mailto:hallo@zin-in-padel.be"
                className="font-medium text-primary hover:underline"
              >
                hallo@zin-in-padel.be
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
