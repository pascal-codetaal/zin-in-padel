import { data, Form, Link } from "react-router";
import {
  findInviteByToken,
  respondToInvite,
} from "~/lib/cascade/respond.server";
import { isValidInviteTokenShape } from "~/lib/cascade/token";
import { findPlayerByRef } from "~/lib/db.server";
import { openSlotsOf } from "~/types/domain";
import { firstNameFromDisplayName, formatPersonName } from "~/lib/person-name";
import type { Route } from "./+types/i.$token.nee";

/**
 * GET = the invite-body link tap. Decline instantly (idempotent) and show
 * a confirmation with an "Toch meedoen?" undo button.
 * POST = explicit re-decline (used by the undo on the accept page).
 */
export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token?.trim();
  if (!token || !isValidInviteTokenShape(token)) {
    throw data("Not Found", { status: 404 });
  }

  const result = await respondToInvite({
    token,
    action: "decline",
    now: new Date(),
  });
  if (!result) throw data("Not Found", { status: 404 });

  const lookup = await findInviteByToken(token);
  if (!lookup) throw data("Not Found", { status: 404 });

  const player = await findPlayerByRef(lookup.invite.playerRef);
  const recipientName = lookup.invitee
    ? formatPersonName({
        firstName: lookup.invitee.firstName,
        lastName: lookup.invitee.lastName,
        profileName: lookup.invitee.profileName,
        fallback: player?.name ?? "daar",
      })
    : (player?.name ?? "daar");
  const firstName = firstNameFromDisplayName(recipientName);

  return {
    token,
    firstName,
    organiserName: lookup.organiser.profileName,
    openSlots: openSlotsOf(lookup.match),
    matchCancelled: lookup.match.status === "cancelled",
    decisionKind: result.decision.kind,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token || !isValidInviteTokenShape(token)) {
    throw data("Not Found", { status: 404 });
  }
  const form = await request.formData();
  const intent = form.get("intent")?.toString();
  if (intent !== "decline") {
    return { ok: false as const };
  }
  await respondToInvite({ token, action: "decline", now: new Date() });
  return { ok: true as const };
}

export function meta() {
  return [{ title: "Uitnodiging — PadelMatch" }];
}

export default function DeclinePage({ loaderData }: Route.ComponentProps) {
  const { token, firstName, organiserName, openSlots, matchCancelled } =
    loaderData;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-gray-50 p-5 dark:bg-gray-950">
      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Padel-uitnodiging
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Bedankt, {firstName}.
        </h1>
        <p className="mt-3 text-gray-700 dark:text-gray-300">
          {matchCancelled
            ? "Deze match werd geannuleerd — geen actie nodig."
            : `${organiserName} weet nu dat je deze keer niet kan.`}
        </p>

        {!matchCancelled && openSlots > 0 && (
          <Form method="post" action={`/i/${token}`} className="mt-6">
            <input type="hidden" name="intent" value="accept" />
            <button
              type="submit"
              className="block w-full rounded-full bg-emerald-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Toch meedoen?
            </button>
            <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
              Nog {openSlots} {openSlots === 1 ? "plek" : "plekken"} open.
            </p>
          </Form>
        )}

        {!matchCancelled && openSlots === 0 && (
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            De match is intussen vol.
          </p>
        )}

        <Link
          to="/"
          className="mt-6 block text-center text-xs text-gray-500 underline transition hover:text-gray-700 dark:text-gray-400"
        >
          Sluiten
        </Link>
      </div>
    </main>
  );
}
