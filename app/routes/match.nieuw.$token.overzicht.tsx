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
    <div className="space-y-5">
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
    </div>
  );
}
