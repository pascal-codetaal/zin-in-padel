import { Form, redirect, useNavigation } from "react-router";
import { nextStepSlug, prevStepSlug, useProfielData } from "./profiel.$token";
import { findUserByManageToken, updateUserProfile } from "~/lib/db.server";
import {
  parseCheckbox,
  parsePreferredSide,
} from "~/lib/profile-form.server";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/profiel.$token.kant";

const STEP_SLUG = "kant" as const;
const PREV_SLUG = prevStepSlug(STEP_SLUG)!;
const NEXT_SLUG = nextStepSlug(STEP_SLUG)!;

const SIDE_OPTIONS = [
  {
    value: "left" as const,
    label: "Links",
    sub: "Backhand-kant (voor rechtshandigen)",
  },
  {
    value: "right" as const,
    label: "Rechts",
    sub: "Forehand-kant (voor rechtshandigen)",
  },
];

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token) return { ok: false as const, error: "missing_token" };
  const user = await findUserByManageToken(token);
  if (!user) return { ok: false as const, error: "user_not_found" };

  const form = await request.formData();
  const preferredSide = parsePreferredSide(form.get("preferredSide"));
  if (preferredSide === null) {
    return { ok: false as const, error: "side_required" };
  }
  const playsBothSides = parseCheckbox(form.get("playsBothSides"));

  await updateUserProfile(user.id, { preferredSide, playsBothSides });
  return redirect(`/profiel/${token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-kant";

export default function KantStep({ actionData }: Route.ComponentProps) {
  const { token, user } = useProfielData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">
            Welke kant speel je?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Je vaste kant van het terrein, gezien van aan de baseline.
          </p>
        </header>

        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <legend className="sr-only">Voorkeurszijde</legend>
          {SIDE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-input bg-background p-4 transition hover:bg-secondary/40 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
            >
              <input
                type="radio"
                name="preferredSide"
                value={option.value}
                defaultChecked={user.preferredSide === option.value}
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

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-input bg-background p-4 transition hover:bg-secondary/40 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
          <input
            type="checkbox"
            name="playsBothSides"
            defaultChecked={user.playsBothSides}
            className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
          />
          <span>
            <span className="block font-medium">Ik speel ook de andere kant</span>
            <span className="block text-xs text-muted-foreground">
              Helpt om sneller een match te vinden.
            </span>
          </span>
        </label>

        {actionData?.ok === false && actionData.error === "side_required" && (
          <p className="text-sm text-destructive">
            Kies een kant om verder te gaan.
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
          to: `/profiel/${token}/${PREV_SLUG}`,
          label: "← Terug",
        }}
      />
    </>
  );
}
