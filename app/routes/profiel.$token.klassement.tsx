import { Form, Link, redirect, useNavigation } from "react-router";
import { nextStepSlug, prevStepSlug, useProfielData } from "./profiel.$token";
import { findUserByManageToken, updateUserProfile } from "~/lib/db.server";
import { parseLevel } from "~/lib/profile-form.server";
import { formatPadelLevel, levelsForGender } from "~/types/domain";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/profiel.$token.klassement";

const STEP_SLUG = "klassement" as const;
const PREV_SLUG = prevStepSlug(STEP_SLUG)!;
const NEXT_SLUG = nextStepSlug(STEP_SLUG)!;

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token) return { ok: false as const, error: "missing_token" };
  const user = await findUserByManageToken(token);
  if (!user) return { ok: false as const, error: "user_not_found" };

  if (user.gender === null) {
    return { ok: false as const, error: "gender_missing" };
  }

  const form = await request.formData();
  const level = parseLevel(form.get("level"));
  if (level === null) {
    return { ok: false as const, error: "level_required" };
  }

  await updateUserProfile(user.id, { level });
  return redirect(`/profiel/${token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-klassement";

export default function KlassementStep({ actionData }: Route.ComponentProps) {
  const { token, user } = useProfielData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const available = levelsForGender(user.gender);

  if (user.gender === null) {
    return (
      <>
        <section className="space-y-3">
          <h2 className="text-2xl font-bold leading-tight">
            Eerst je geslacht
          </h2>
          <p className="text-sm text-muted-foreground">
            De P-klassementen verschillen tussen heren en dames.
          </p>
        </section>
        <FixedLinkFooter
          to={`/profiel/${token}/${PREV_SLUG}`}
          label="← Terug naar geslacht"
        />
      </>
    );
  }

  return (
    <>
      <Form
        id={FORM_ID}
        method="post"
        key={user.gender}
        className="space-y-5"
      >
        <header>
          <h2 className="text-2xl font-bold leading-tight">
            Wat is je klassement?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Geen idee? Schat het in — je kan later aanpassen.
          </p>
        </header>

        <fieldset className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <legend className="sr-only">Klassement</legend>
          {available.map((level) => (
            <label key={level} className="group relative flex cursor-pointer">
              <input
                type="radio"
                name="level"
                value={level}
                defaultChecked={user.level === level}
                required
                className="peer sr-only"
              />
              <span className="flex h-12 w-full items-center justify-center rounded-xl border border-input bg-background text-base font-semibold tabular-nums transition peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring group-hover:bg-secondary/60">
                {formatPadelLevel(level)}
              </span>
            </label>
          ))}
        </fieldset>

        {actionData?.ok === false && actionData.error === "level_required" && (
          <p className="text-sm text-destructive">
            Kies een klassement om verder te gaan.
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

function FixedLinkFooter({ to, label }: { to: string; label: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="border-t border-border/60 bg-background/85 backdrop-blur-md">
        <div className="pointer-events-auto mx-auto max-w-3xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:px-6">
          <Link
            to={to}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-glow transition hover:bg-accent/90"
          >
            {label}
          </Link>
        </div>
      </div>
    </div>
  );
}
