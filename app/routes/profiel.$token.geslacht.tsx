import { Form, redirect, useNavigation } from "react-router";
import { nextStepSlug, useProfielData } from "./profiel.$token";
import { findUserByManageToken, updateUserProfile } from "~/lib/db.server";
import { parseGender } from "~/lib/profile-form.server";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/profiel.$token.geslacht";

const STEP_SLUG = "geslacht" as const;
const NEXT_SLUG = nextStepSlug(STEP_SLUG)!;

const GENDER_OPTIONS = [
  { value: "m" as const, label: "Heren", sub: "Klassement P100 – P1000" },
  { value: "w" as const, label: "Dames", sub: "Klassement P50 – P700" },
];

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token) return { ok: false as const, error: "missing_token" };
  const user = await findUserByManageToken(token);
  if (!user) return { ok: false as const, error: "user_not_found" };

  const form = await request.formData();
  const gender = parseGender(form.get("gender"));
  if (gender === null) {
    return { ok: false as const, error: "gender_required" };
  }

  await updateUserProfile(user.id, { gender });
  return redirect(`/profiel/${token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-geslacht";

export default function GeslachtStep({ actionData }: Route.ComponentProps) {
  const { token, user } = useProfielData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">
            Heren of dames?
          </h2>
        </header>

        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <legend className="sr-only">Geslacht</legend>
          {GENDER_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-input bg-background p-4 transition hover:bg-secondary/40 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
            >
              <input
                type="radio"
                name="gender"
                value={option.value}
                defaultChecked={user.gender === option.value}
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

        {actionData?.ok === false && actionData.error === "gender_required" && (
          <p className="text-sm text-destructive">
            Kies je geslacht om verder te gaan.
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
        secondary={{ kind: "link", to: `/profiel/${token}`, label: "Annuleren" }}
      />
    </>
  );
}
