import { Link } from "react-router";
import { MatchDraftOverviewCard } from "~/components/match-draft-overview-card";
import { loadDraftOverviewData } from "~/lib/match-draft-overview.server";
import { requireDraftFor } from "~/lib/match-wizard.server";
import { formatPersonName } from "~/lib/person-name";
import type { Route } from "./+types/match.nieuw.$token.overzicht";

export async function loader({ params }: Route.LoaderArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const overview = await loadDraftOverviewData(draft, user.favoriteNames);
  const organizerName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: "speler",
  });
  return { token: params.token!, overview, organizerName };
}

export function meta() {
  return [
    { title: "Match-overzicht — PadelMatch" },
    {
      name: "description",
      content: "Bekijk hoe je match is ingevuld voordat je uitnodigingen verstuurt",
    },
  ];
}

export default function DraftMatchOverviewPage({
  loaderData,
}: Route.ComponentProps) {
  const { token, overview, organizerName } = loaderData;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to={`/match/nieuw/${token}`}
            className="flex items-center gap-2 font-display text-base font-bold"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground shadow-glow">
              <BallIcon className="h-3.5 w-3.5" />
            </span>
            Overzicht
          </Link>
          <Link
            to={`/match/${token}`}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Live matches →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-32 pt-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          {organizerName}, zo staat je match er nu vooruit.
        </p>

        <MatchDraftOverviewCard data={overview} token={token} />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to={`/match/nieuw/${token}/bevestigen`}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-glow transition hover:bg-accent/90"
          >
            Verder instellen →
          </Link>
          <Link
            to={`/match/nieuw/${token}`}
            className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-medium transition hover:bg-secondary/60"
          >
            Wizard
          </Link>
        </div>
      </main>
    </div>
  );
}

function BallIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M5.4 6.2C8.6 8.6 8.6 15.4 5.4 17.8" />
      <path d="M18.6 6.2c-3.2 2.4-3.2 9.2 0 11.6" />
    </svg>
  );
}
