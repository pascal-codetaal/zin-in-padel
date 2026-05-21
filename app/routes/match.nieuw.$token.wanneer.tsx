import { Form, redirect, useNavigation } from "react-router";
import { nextMatchStep, useMatchWizardData } from "./match.nieuw.$token";
import { requireDraftFor } from "~/lib/match-wizard.server";
import { updateMatchDraft } from "~/lib/db.server";
import { getClubsByIds } from "~/lib/clubs.server";
import {
  DURATION_OPTIONS,
  fromDatetimeLocalValue,
  nextSaturdayEvening,
  toDatetimeLocalValue,
} from "~/lib/match-defaults";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/match.nieuw.$token.wanneer";

const STEP_SLUG = "wanneer" as const;
const NEXT_SLUG = nextMatchStep(STEP_SLUG)!;

export async function loader({ params }: Route.LoaderArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const preferredClubs = await getClubsByIds(user.preferredClubIds);
  return {
    draft: {
      scheduledAt: draft.scheduledAt,
      durationMinutes: draft.durationMinutes,
      clubId: draft.clubId,
    },
    clubs: preferredClubs.map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
    })),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { draft } = await requireDraftFor(params.token);
  const form = await request.formData();

  const scheduledAt = fromDatetimeLocalValue(
    form.get("scheduledAt")?.toString() ?? null,
  );
  const durationRaw = form.get("durationMinutes")?.toString() ?? "";
  const durationParsed = Number.parseInt(durationRaw, 10);
  const durationMinutes = Number.isFinite(durationParsed)
    ? durationParsed
    : draft.durationMinutes;
  const clubId = form.get("clubId")?.toString().trim() || null;

  if (!scheduledAt) {
    return { ok: false as const, error: "schedule_required" };
  }
  if (!clubId) {
    return { ok: false as const, error: "club_required" };
  }

  await updateMatchDraft(draft.id, {
    scheduledAt,
    durationMinutes,
    clubId,
  });
  return redirect(`/match/nieuw/${params.token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-wanneer";

export default function WanneerStep({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { token } = useMatchWizardData();
  const { draft, clubs } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  const defaultScheduledAt = draft.scheduledAt
    ? toDatetimeLocalValue(new Date(draft.scheduledAt))
    : toDatetimeLocalValue(nextSaturdayEvening());

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">Wanneer & waar?</h2>
        </header>

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Datum & uur
          </span>
          <input
            type="datetime-local"
            name="scheduledAt"
            defaultValue={defaultScheduledAt}
            required
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Duur
          </span>
          <select
            name="durationMinutes"
            defaultValue={draft.durationMinutes}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {DURATION_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Club
          </p>
          {clubs.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
              Geen voorkeurclubs ingesteld. Voeg er eerst één toe in je profiel.
            </p>
          ) : (
            <fieldset className="mt-2 space-y-2">
              <legend className="sr-only">Club</legend>
              {clubs.map((club) => (
                <label
                  key={club.id}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-input bg-background p-3 transition hover:bg-secondary/40 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                >
                  <input
                    type="radio"
                    name="clubId"
                    value={club.id}
                    defaultChecked={draft.clubId === club.id}
                    required
                    className="h-4 w-4 accent-[color:var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {club.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {club.city}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </div>

        {actionData?.ok === false && (
          <p className="text-sm text-destructive">
            {actionData.error === "schedule_required"
              ? "Kies een datum en uur."
              : actionData.error === "club_required"
                ? "Kies een club."
                : "Er ging iets mis."}
          </p>
        )}
      </Form>

      <StepFooter
        primary={{
          type: "submit",
          form: FORM_ID,
          label: "Bewaar & verder →",
          busyLabel: "Opslaan…",
          busy: isSubmitting,
        }}
        secondary={{
          kind: "link",
          to: `/match/nieuw/${token}`,
          label: "← Annuleren",
        }}
      />
    </>
  );
}
