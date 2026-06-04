import { Link } from "react-router";
import {
  listReferralLeaderboard,
} from "~/lib/referrals.server";
import { REFERRAL_CAMPAIGN } from "~/lib/referrals.shared";
import type { Route } from "./+types/vriendenactie";

export function meta() {
  return [
    { title: "Vriendenactie | Zin in Padel" },
    {
      name: "description",
      content:
        "Nodig padelvrienden uit via WhatsApp en volg het leaderboard van de Zin in Padel vriendenactie.",
    },
  ];
}

export async function loader() {
  const leaderboard = await listReferralLeaderboard(50);
  return { leaderboard };
}

export default function VriendenactiePage({ loaderData }: Route.ComponentProps) {
  const { leaderboard } = loaderData;

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link to="/" className="text-sm font-medium text-primary hover:underline">
          Terug naar Zin in Padel
        </Link>

        <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {REFERRAL_CAMPAIGN.periodLabel}
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {REFERRAL_CAMPAIGN.title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Deel je persoonlijke WhatsApp-link met padelvrienden. Zij sturen zelf
            een bericht naar onze bot en tellen mee zodra ze aansluiten via
            WhatsApp.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {REFERRAL_CAMPAIGN.prizes.map((prize, index) => (
              <article
                key={prize}
                className="rounded-2xl border border-border bg-secondary/40 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Prijs {index + 1}
                </p>
                <p className="mt-2 text-sm font-medium">{prize}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
          <h2 className="font-display text-2xl font-bold">Leaderboard</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Alleen vrienden die zelf via WhatsApp aansluiten tellen mee.
          </p>

          {leaderboard.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-8 text-center text-sm text-muted-foreground">
              Nog geen gekwalificeerde referrals.
            </p>
          ) : (
            <ol className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {leaderboard.map((entry, index) => (
                <li
                  key={entry.userId}
                  className="flex items-center justify-between gap-4 bg-background px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <span className="font-medium">{entry.displayName}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {entry.qualifiedCount === 1
                      ? "1 aangesloten vriend"
                      : `${entry.qualifiedCount} aangesloten vrienden`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-8 rounded-3xl border border-border bg-card p-6 text-sm leading-relaxed text-muted-foreground shadow-soft sm:p-8">
          <h2 className="text-lg font-semibold text-foreground">
            Actievoorwaarden in het kort
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>De actieperiode wordt nog vastgelegd.</li>
            <li>Alleen unieke, echte WhatsApp-gebruikers tellen mee.</li>
            <li>Self-referrals en misbruik tellen niet mee.</li>
            <li>De top 3 wint de drie prijzen.</li>
            <li>Winnaars worden gecontacteerd via WhatsApp.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
