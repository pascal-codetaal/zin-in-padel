import { data, redirect } from "react-router";
import {
  findInviteByToken,
  respondToInvite,
} from "~/lib/cascade/respond.server";
import { isValidInviteTokenShape } from "~/lib/cascade/token";
import { MatchLiveOverview } from "~/components/match-live-overview";
import { buildLiveMatchOverviewData } from "~/lib/match-live-overview.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import type { Route } from "./+types/match.deelname.$token";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData
    ? `${formatScheduledAt(loaderData.match.scheduledAt)} - Match-overzicht`
    : "Match-overzicht";
  return [{ title: `${title} - PadelMatch` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token?.trim();
  if (!token || !isValidInviteTokenShape(token)) {
    throw data("Not Found", { status: 404 });
  }

  const lookup = await findInviteByToken(token);
  if (!lookup) throw data("Not Found", { status: 404 });

  const viewer = lookup.invitee ?? lookup.organiser;
  return {
    token,
    match: await buildLiveMatchOverviewData(
      lookup.match,
      viewer,
      lookup.invite.playerRef,
    ),
    participant: {
      status: lookup.invite.status,
      canLeave:
        lookup.invite.status === "accepted" &&
        lookup.match.status !== "cancelled",
    },
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token || !isValidInviteTokenShape(token)) {
    throw data("Not Found", { status: 404 });
  }

  const form = await request.formData();
  const intent = form.get("intent")?.toString();
  if (intent !== "leave") {
    return { ok: false as const, error: "unknown_intent" };
  }

  await respondToInvite({
    token,
    action: "decline",
    now: new Date(),
  });
  return redirect(`/match/deelname/${token}`);
}

export default function ParticipantMatchOverview({
  loaderData,
}: Route.ComponentProps) {
  const { token, match, participant } = loaderData;
  return (
    <MatchLiveOverview
      role="participant"
      match={match}
      participant={participant}
      links={{
        backHref: `/i/${token}`,
        backLabel: "Uitnodiging",
      }}
    />
  );
}
