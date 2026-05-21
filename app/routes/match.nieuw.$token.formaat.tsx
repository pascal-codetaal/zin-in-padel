import { Form, redirect, useNavigation } from "react-router";
import {
  nextMatchStep,
  prevMatchStep,
  useMatchWizardData,
} from "./match.nieuw.$token";
import { requireDraftFor } from "~/lib/match-wizard.server";
import { updateMatchDraft } from "~/lib/db.server";
import { StepFooter } from "~/components/step-footer";
import type { MatchFormat } from "~/types/domain";
import type { Route } from "./+types/match.nieuw.$token.formaat";

const STEP_SLUG = "formaat" as const;
const PREV_SLUG = prevMatchStep(STEP_SLUG)!;
const NEXT_SLUG = nextMatchStep(STEP_SLUG)!;

const FORMAT_OPTIONS: { value: MatchFormat; label: string; sub: string }[] = [
  { value: "mixed", label: "Mixed", sub: "Heren en dames samen" },
  { value: "men_only", label: "Enkel heren", sub: "Alleen mannen" },
  { value: "women_only", label: "Enkel dames", sub: "Alleen vrouwen" },
];

function parseFormat(value: FormDataEntryValue | null): MatchFormat | null {
  const v = value?.toString().trim() ?? "";
  if (v === "mixed" || v === "men_only" || v === "women_only") return v;
  return null;
}

export async function loader({ params }: Route.LoaderArgs) {
  const { draft } = await requireDraftFor(params.token);
  return { draft: { format: draft.format } };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { draft } = await requireDraftFor(params.token);
  const form = await request.formData();
  const format = parseFormat(form.get("format"));
  if (format === null) {
    return { ok: false as const, error: "format_required" };
  }
  await updateMatchDraft(draft.id, { format });
  return redirect(`/match/nieuw/${params.token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-formaat";

export default function FormaatStep({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { token, organizer } = useMatchWizardData();
  const { draft } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">
            Welk formaat?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Voorgesteld op basis van jouw geslacht
            {organizer.gender === "m"
              ? " (heren)"
              : organizer.gender === "w"
                ? " (dames)"
                : ""}
            .
          </p>
        </header>

        <fieldset className="space-y-2">
          <legend className="sr-only">Formaat</legend>
          {FORMAT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-input bg-background p-4 transition hover:bg-secondary/40 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
            >
              <input
                type="radio"
                name="format"
                value={option.value}
                defaultChecked={draft.format === option.value}
                required
                className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {option.sub}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {actionData?.ok === false && (
          <p className="text-sm text-destructive">
            Kies een formaat om verder te gaan.
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
          to: `/match/nieuw/${token}/${PREV_SLUG}`,
          label: "← Terug",
        }}
      />
    </>
  );
}
