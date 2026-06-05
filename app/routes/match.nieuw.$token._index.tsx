import { Form, Link, redirect } from "react-router";
import {
  discardMatchDraft,
  findDraftMatch,
  findOrCreateDraftMatch,
  findUserByManageToken,
} from "~/lib/db.server";
import { MATCH_STEPS, useMatchWizardData } from "./match.nieuw.$token";
import { formatPersonName } from "~/lib/person-name";
import { formatScheduledAt } from "~/lib/match-defaults";
import type { Route } from "./+types/match.nieuw.$token._index";

const STEP_BULLETS = [
  { title: "Wanneer", sub: "Datum, uur en club" },
  { title: "Formaat", sub: "Mixed, heren of dames" },
  { title: "Huidige spelers", sub: "Wie speelt al mee op de baan" },
  { title: "Uitnodigen", sub: "Zoeklagen en vrienden aan/uit" },
  { title: "Vrienden uitnodigen", sub: "Alleen als je vrienden inschakelt" },
  { title: "Overzicht", sub: "Controleren en match aanmaken" },
];

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token!.trim();
  const user = await findUserByManageToken(token);
  if (!user) throw new Response("Not Found", { status: 404 });
  const draft = await findDraftMatch(user.id);
  return {
    draft: draft
      ? {
          scheduledAt: draft.scheduledAt,
          updatedAt: draft.updatedAt,
        }
      : null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token!.trim();
  const user = await findUserByManageToken(token);
  if (!user) {
    return { ok: false as const, error: "user_not_found" };
  }

  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  if (intent === "discard") {
    const existing = await findDraftMatch(user.id);
    if (existing) await discardMatchDraft(existing.id);
    return redirect(`/match/nieuw/${token}`);
  }

  await findOrCreateDraftMatch(user.id);
  return redirect(`/match/nieuw/${token}/${MATCH_STEPS[0]!.slug}`);
}

export default function MatchWelcome({ loaderData }: Route.ComponentProps) {
  const { token, organizer } = useMatchWizardData();
  const organizerName = formatPersonName({
    firstName: organizer.firstName,
    lastName: organizer.lastName,
    profileName: organizer.profileName,
    fallback: "speler",
  });
  const { draft } = loaderData;
  const hasDraft = draft !== null;

  return (
    <>
      <section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Nieuwe match
          </p>
          <h1 className="mt-1 text-3xl font-bold leading-tight">
            Plan een potje 🎾
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Hoi {organizerName}! Eerst wanneer en waar, dan wie er
            al meespeelt en wie je uitnodigt.
          </p>
        </div>

        {hasDraft && (
          <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
            <p className="text-sm font-medium">
              Je hebt een onafgewerkte match
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatScheduledAt(draft.scheduledAt)}
            </p>
            <Form method="post" className="mt-3">
              <input type="hidden" name="intent" value="discard" />
              <button
                type="submit"
                className="text-xs font-medium text-muted-foreground transition hover:text-destructive"
              >
                Weggooien en opnieuw beginnen
              </button>
            </Form>
          </div>
        )}

        <ul className="space-y-2">
          {STEP_BULLETS.map((bullet, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-medium">
                  {bullet.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {bullet.sub}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {organizer.preferredClubIds.length === 0 && (
          <p className="rounded-2xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            Tip: voeg eerst minstens 1 club toe in{" "}
            <Link
              to={`/profiel/${token}/clubs`}
              className="font-medium underline"
            >
              je profiel
            </Link>{" "}
            zodat we een locatie kunnen voorstellen.
          </p>
        )}
      </section>

      <FixedStartFooter hasDraft={hasDraft} />
    </>
  );
}

function FixedStartFooter({ hasDraft }: { hasDraft: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="border-t border-border/60 bg-background/85 backdrop-blur-md">
        <div className="pointer-events-auto mx-auto max-w-3xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:px-6">
          <Form method="post">
            <input type="hidden" name="intent" value="start" />
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-glow transition hover:bg-accent/90"
            >
              {hasDraft ? "Verder met deze match →" : "Start →"}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
