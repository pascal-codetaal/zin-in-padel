import { data, Form, Link } from "react-router";
import {
  findInviteByToken,
  respondToInvite,
} from "~/lib/cascade/respond.server";
import { findPlayerByRef, findUserByPhone } from "~/lib/db.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import {
  acceptedPlayerRefsOf,
  formatPadelLevel,
  openSlotsOf,
} from "~/types/domain";
import { isValidInviteTokenShape } from "~/lib/cascade/token";
import { canonicalRefName } from "~/lib/friend-name.server";
import { formatPersonName } from "~/lib/person-name";
import type { Route } from "./+types/i.$token";
import {
  deriveRenderState,
  type LoaderState,
  type RejectReason,
} from "./i.$token.state";

type AcceptedName = { name: string; isSelf: boolean };

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token?.trim();
  if (!token || !isValidInviteTokenShape(token)) {
    throw data("Not Found", { status: 404 });
  }

  const lookup = await findInviteByToken(token);
  if (!lookup) throw data("Not Found", { status: 404 });

  const { match, invite, invitee, organiser } = lookup;

  const player = await findPlayerByRef(invite.playerRef);
  const recipientName = invitee
    ? formatPersonName({
        firstName: invitee.firstName,
        lastName: invitee.lastName,
        profileName: invitee.profileName,
        fallback: player?.name ?? "daar",
      })
    : (player?.name ?? "daar");
  const firstName = recipientName.split(/\s+/)[0] ?? recipientName;

  const acceptedRefs = acceptedPlayerRefsOf(match);
  const acceptedNames: AcceptedName[] = await Promise.all(
    acceptedRefs.map(async (ref) => {
      const p = await findPlayerByRef(ref);
      const owner = await findUserByPhone(p?.phone ?? ref);
      return {
        name: canonicalRefName(ref, p, owner ? [owner] : [], ref),
        isSelf: ref === invite.playerRef,
      };
    }),
  );

  const openSlots = openSlotsOf(match);

  let state: LoaderState;
  const now = new Date();
  if (match.status === "cancelled") {
    state = { kind: "blocked", reason: "match-cancelled" };
  } else if (
    match.scheduledAt &&
    new Date(match.scheduledAt).getTime() <= now.getTime()
  ) {
    state = { kind: "blocked", reason: "match-started" };
  } else if (invite.status === "expired") {
    state = { kind: "blocked", reason: "invite-expired" };
  } else if (invite.status === "accepted") {
    state = { kind: "already-accepted", openSlots };
  } else if (invite.status === "declined") {
    state = { kind: "declined", openSlots };
  } else if (openSlots === 0) {
    state = { kind: "blocked", reason: "match-full" };
  } else {
    state = { kind: "ok", openSlots };
  }

  return {
    token,
    firstName,
    organiserName: organiser.profileName,
    clubName: lookup.match.clubId ? null : null, // hydrated below
    scheduledAt: match.scheduledAt,
    confirmedSlotNames: match.confirmedSlotNames,
    acceptedNames,
    totalSlots: match.totalSlots,
    format: match.format,
    fallbackLevelMin: match.fallbackLevelMin,
    fallbackLevelMax: match.fallbackLevelMax,
    cascadePhase: invite.cascadePhase,
    state,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token || !isValidInviteTokenShape(token)) {
    throw data("Not Found", { status: 404 });
  }

  const form = await request.formData();
  const intent = form.get("intent")?.toString();
  if (intent !== "accept") {
    return { ok: false as const, error: "invalid_intent" };
  }

  const result = await respondToInvite({
    token,
    action: "accept",
    now: new Date(),
  });
  if (!result) throw data("Not Found", { status: 404 });

  if (result.decision.kind === "reject") {
    return {
      ok: false as const,
      reason: result.decision.reason,
    };
  }
  return { ok: true as const };
}

export function meta({ data: loaderData }: Route.MetaArgs) {
  const club = loaderData?.organiserName;
  return [{ title: club ? `Uitnodiging — PadelMatch` : "Uitnodiging" }];
}

export default function AcceptPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    token,
    firstName,
    organiserName,
    scheduledAt,
    acceptedNames,
    totalSlots,
    fallbackLevelMin,
    fallbackLevelMax,
    cascadePhase,
    state,
  } = loaderData;

  const renderState = deriveRenderState(state, actionData);

  return (
    <main className="mx-auto min-h-screen max-w-md bg-gray-50 p-5 dark:bg-gray-950">
      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Padel-uitnodiging
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Hallo {firstName}!
        </h1>

        <p className="mt-3 text-gray-700 dark:text-gray-300">
          {cascadePhase === 1
            ? `${organiserName} nodigt je uit voor een padelmatch.`
            : cascadePhase === 2
              ? `${organiserName} organiseert een padelmatch op jouw niveau.`
              : `${organiserName} organiseert een padelmatch die nog spelers zoekt.`}
        </p>

        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              Wanneer
            </dt>
            <dd className="text-right text-gray-900 dark:text-gray-100">
              {formatScheduledAt(scheduledAt)}
            </dd>
          </div>
          {cascadePhase === 2 && fallbackLevelMin && fallbackLevelMax && (
            <div className="flex justify-between gap-3">
              <dt className="font-medium text-gray-500 dark:text-gray-400">
                Niveau
              </dt>
              <dd className="text-right text-gray-900 dark:text-gray-100">
                {formatPadelLevel(fallbackLevelMin)}
                {" – "}
                {formatPadelLevel(fallbackLevelMax)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              Plekken
            </dt>
            <dd className="text-right text-gray-900 dark:text-gray-100">
              {totalSlots - (renderState.kind === "blocked" ? 0 : renderState.openSlots)}/{totalSlots}{" "}
              ingevuld
            </dd>
          </div>
        </dl>

        {acceptedNames.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Al aan boord
            </p>
            <ul className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              {acceptedNames.map((p, i) => (
                <li key={i}>
                  {p.name.split(/\s+/)[0]}
                  {p.isSelf ? " (jij)" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6">
          <Action state={renderState} token={token} firstName={firstName} />
        </div>
      </div>
    </main>
  );
}

function Action({
  state,
  token,
  firstName,
}: {
  state: LoaderState;
  token: string;
  firstName: string;
}) {
  if (state.kind === "ok") {
    return (
      <Form method="post" className="space-y-3">
        <input type="hidden" name="intent" value="accept" />
        <button
          type="submit"
          className="block w-full rounded-full bg-emerald-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          Ja, ik ben erbij ✅
        </button>
        <Link
          to={`/i/${token}/nee`}
          className="block w-full rounded-full border border-gray-300 px-5 py-3 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Niet vandaag
        </Link>
      </Form>
    );
  }

  if (state.kind === "already-accepted") {
    return (
      <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
        <p className="font-semibold">Top, {firstName}! Je bent ingeschreven 🎾</p>
        <p className="mt-1">
          {state.openSlots > 0
            ? `Nog ${state.openSlots} ${state.openSlots === 1 ? "plek" : "plekken"} open.`
            : "Match is nu vol — we zien je op het terrein."}
        </p>
        <Form method="post" action={`/i/${token}/nee`} className="mt-3">
          <input type="hidden" name="intent" value="decline" />
          <button
            type="submit"
            className="text-xs font-medium text-emerald-900 underline transition hover:text-emerald-700 dark:text-emerald-200"
          >
            Toch niet meedoen
          </button>
        </Form>
      </div>
    );
  }

  if (state.kind === "declined") {
    return (
      <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <p>Je gaf aan dat je niet kon.</p>
        {state.openSlots > 0 ? (
          <Form method="post" className="mt-3">
            <input type="hidden" name="intent" value="accept" />
            <button
              type="submit"
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              Toch meedoen?
            </button>
          </Form>
        ) : (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            De match is intussen vol.
          </p>
        )}
      </div>
    );
  }

  return <BlockedMessage reason={state.reason} />;
}

function BlockedMessage({ reason }: { reason: RejectReason }) {
  const text =
    reason === "match-full"
      ? "Sorry, deze match is intussen vol."
      : reason === "match-cancelled"
        ? "Deze match werd geannuleerd."
        : reason === "match-started"
          ? "Deze match is al begonnen."
          : "Deze uitnodiging is verlopen.";
  return (
    <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
      <p>{text}</p>
    </div>
  );
}
