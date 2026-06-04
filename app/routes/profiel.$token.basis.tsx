import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { nextStepSlug, useProfielData } from "./profiel.$token";
import { findUserByManageToken, updateUserProfile } from "~/lib/db.server";
import { parseGender, parseLevel } from "~/lib/profile-form.server";
import { StepFooter } from "~/components/step-footer";
import {
  formatPadelLevel,
  levelsForGender,
  type Gender,
} from "~/types/domain";
import type { Route } from "./+types/profiel.$token.basis";

const STEP_SLUG = "basis" as const;
const NEXT_SLUG = nextStepSlug(STEP_SLUG)!;

const GENDER_OPTIONS = [
  { value: "m" as const, label: "Man", sub: "Klassement P100 – P1000" },
  { value: "w" as const, label: "Vrouw", sub: "Klassement P50 – P700" },
];

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token) return { ok: false as const, error: "missing_token" };
  const user = await findUserByManageToken(token);
  if (!user) return { ok: false as const, error: "user_not_found" };

  const form = await request.formData();
  const firstName = form.get("firstName")?.toString().trim() ?? "";
  const lastName = form.get("lastName")?.toString().trim() ?? "";
  const gender = parseGender(form.get("gender"));
  const level = parseLevel(form.get("level"));

  if (!firstName || !lastName) {
    return { ok: false as const, error: "name_required" };
  }
  if (gender === null) {
    return { ok: false as const, error: "gender_required" };
  }
  if (level === null) {
    return { ok: false as const, error: "level_required" };
  }
  if (!levelsForGender(gender).includes(level)) {
    return { ok: false as const, error: "level_invalid" };
  }

  await updateUserProfile(user.id, { firstName, lastName, gender, level });
  return redirect(`/profiel/${token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-basis";

export default function BasisStep({ actionData }: Route.ComponentProps) {
  const { token, user } = useProfielData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const [gender, setGender] = useState<Gender | null>(user.gender);
  const available = levelsForGender(gender);
  const levelValidForGender =
    user.level !== null && gender !== null && available.includes(user.level);

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-10">
        <section className="space-y-5">
          <header>
            <h2 className="text-2xl font-bold leading-tight">Hoe heet je?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Voornaam en familienaam — zo tonen we je overal op PadelMatch.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Voornaam</span>
              <input
                type="text"
                name="firstName"
                required
                autoComplete="given-name"
                defaultValue={user.firstName ?? ""}
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
                placeholder="Jan"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Familienaam</span>
              <input
                type="text"
                name="lastName"
                required
                autoComplete="family-name"
                defaultValue={user.lastName ?? ""}
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
                placeholder="Janssens"
              />
            </label>
          </div>

          {actionData?.ok === false && actionData.error === "name_required" && (
            <p className="text-sm text-destructive">
              Vul zowel voornaam als familienaam in.
            </p>
          )}
        </section>

        <section className="space-y-5">
          <header>
            <h2 className="text-2xl font-bold leading-tight">Man of vrouw?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              De P-klassementen verschillen — zo tonen we het juiste niveau en
              matchen we je met passende vrienden.
            </p>
          </header>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="sr-only">Man of vrouw</legend>
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
                  onChange={() => setGender(option.value)}
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
              Kies man of vrouw om verder te gaan.
            </p>
          )}
        </section>

        <section className="space-y-5">
          <header>
            <h2 className="text-2xl font-bold leading-tight">
              Wat is je klassement?
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Geen idee? Schat het in — je kan later aanpassen.
            </p>
          </header>

          {gender === null ? (
            <p className="text-sm text-muted-foreground">
              Kies eerst man of vrouw om je P-klassement te zien.
            </p>
          ) : (
            <fieldset
              key={gender}
              className="grid grid-cols-3 gap-2 sm:grid-cols-4"
            >
              <legend className="sr-only">Klassement</legend>
              {available.map((level) => (
                <label key={level} className="group relative flex cursor-pointer">
                  <input
                    type="radio"
                    name="level"
                    value={level}
                    defaultChecked={
                      levelValidForGender && user.level === level
                    }
                    required
                    className="peer sr-only"
                  />
                  <span className="flex h-12 w-full items-center justify-center rounded-xl border border-input bg-background text-base font-semibold tabular-nums transition peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring group-hover:bg-secondary/60">
                    {formatPadelLevel(level)}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {actionData?.ok === false &&
            (actionData.error === "level_required" ||
              actionData.error === "level_invalid") && (
              <p className="text-sm text-destructive">
                Kies een klassement om verder te gaan.
              </p>
            )}
        </section>
      </Form>

      <StepFooter
        primary={{
          type: "submit",
          form: FORM_ID,
          label: "Bewaar & verder →",
          busyLabel: "Opslaan…",
          busy: isSubmitting,
          disabled: gender === null,
        }}
        secondary={{ kind: "link", to: `/profiel/${token}`, label: "Annuleren" }}
      />
    </>
  );
}
