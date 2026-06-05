import { data, redirect } from "react-router";
import {
  findMatchById,
  findUserByManageToken,
} from "~/lib/db.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import { MatchLiveOverview } from "~/components/match-live-overview";
import { buildLiveMatchOverviewData } from "~/lib/match-live-overview.server";
import type { Match, User } from "~/types/domain";
import {
  cancelMatchAsOrganiser,
  removePlayerFromMatch,
  skipCascadePhase,
} from "~/lib/cascade/organiser.server";
import type { Route } from "./+types/match.$token.$matchId";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData
    ? `${formatScheduledAt(loaderData.match.scheduledAt)} - Match-overzicht`
    : "Match-overzicht";
  return [{ title: `${title} - PadelMatch` }];
}

async function requireOwnedMatch(
  token: string | undefined,
  matchId: string | undefined,
): Promise<{ token: string; user: User; match: Match }> {
  const trimmedToken = token?.trim();
  const trimmedMatchId = matchId?.trim();
  if (!trimmedToken || !trimmedMatchId) {
    throw data("Not Found", { status: 404 });
  }

  const [user, match] = await Promise.all([
    findUserByManageToken(trimmedToken),
    findMatchById(trimmedMatchId),
  ]);
  if (!user || !match || match.status === "draft") {
    throw data("Not Found", { status: 404 });
  }
  if (match.organizerId !== user.id) {
    throw data("Not Found", { status: 404 });
  }
  return { token: trimmedToken, user, match };
}

export async function loader({ params }: Route.LoaderArgs) {
  const { token, user, match } = await requireOwnedMatch(
    params.token,
    params.matchId,
  );
  return {
    token,
    match: await buildLiveMatchOverviewData(match, user, null),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { token, match } = await requireOwnedMatch(params.token, params.matchId);
  const form = await request.formData();
  const intent = form.get("intent")?.toString();
  const now = new Date();

  if (intent === "cancel") {
    await cancelMatchAsOrganiser({ matchId: match.id, now });
    return redirect(`/match/${token}/${match.id}`);
  }

  if (intent === "remove-player") {
    const playerRef = form.get("playerRef")?.toString();
    const confirmedSlotName = form.get("confirmedSlotName")?.toString();
    if (!playerRef && !confirmedSlotName) {
      return { ok: false as const, error: "missing_target" };
    }
    await removePlayerFromMatch({
      matchId: match.id,
      playerRef: playerRef || undefined,
      confirmedSlotName: confirmedSlotName || undefined,
      now,
    });
    return redirect(`/match/${token}/${match.id}`);
  }

  if (intent === "skip-phase") {
    await skipCascadePhase({ matchId: match.id, now });
    return redirect(`/match/${token}/${match.id}`);
  }

  return { ok: false as const, error: "unknown_intent" };
}

export default function OrganiserMatchOverview({
  loaderData,
}: Route.ComponentProps) {
  const { token, match } = loaderData;
  return (
    <MatchLiveOverview
      role="organiser"
      match={match}
      links={{
        backHref: `/match/${token}`,
        backLabel: "Mijn matches",
        newMatchHref: `/match/nieuw/${token}`,
      }}
    />
  );
}
