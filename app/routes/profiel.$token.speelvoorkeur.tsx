import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { nextStepSlug, prevStepSlug, useProfielData } from "./profiel.$token";
import { findUserByManageToken, updateUserProfile } from "~/lib/db.server";
import {
  parseLevel,
  parseMatchPreference,
} from "~/lib/profile-form.server";
import {
  formatPadelLevel,
  levelsForGender,
  stepLevel,
  type MatchPreference,
  type PadelLevel,
} from "~/types/domain";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/profiel.$token.speelvoorkeur";

const STEP_SLUG = "speelvoorkeur" as const;
const PREV_SLUG = prevStepSlug(STEP_SLUG)!;
const NEXT_SLUG = nextStepSlug(STEP_SLUG)!;

const MATCH_PREFERENCE_OPTIONS: {
  value: MatchPreference;
  label: string;
  sub: string;
}[] = [
  {
    value: "friends_only",
    label: "Alleen maatjes",
    sub: "Spelers uit je eigen lijst",
  },
  {
    value: "level_only",
    label: "Mijn klassement",
    sub: "Spelers binnen een P-range",
  },
  { value: "open", label: "Iedereen", sub: "Open voor alle klassementen" },
];

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token) return { ok: false as const, error: "missing_token" };
  const user = await findUserByManageToken(token);
  if (!user) return { ok: false as const, error: "user_not_found" };

  const form = await request.formData();
  const matchPreference = parseMatchPreference(form.get("matchPreference"));
  if (matchPreference === null) {
    return { ok: false as const, error: "preference_required" };
  }

  if (matchPreference === "level_only") {
    const matchLevelMin = parseLevel(form.get("matchLevelMin"));
    const matchLevelMax = parseLevel(form.get("matchLevelMax"));
    await updateUserProfile(user.id, {
      matchPreference,
      matchLevelMin,
      matchLevelMax,
    });
  } else {
    await updateUserProfile(user.id, { matchPreference });
  }

  return redirect(`/profiel/${token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-speelvoorkeur";

export default function SpeelvoorkeurStep({
  actionData,
}: Route.ComponentProps) {
  const { token, user } = useProfielData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const [preference, setPreference] = useState<MatchPreference | null>(
    user.matchPreference,
  );

  const available = levelsForGender(user.gender);
  const defaultMin: PadelLevel =
    user.matchLevelMin ??
    (user.level !== null
      ? stepLevel(user.level, "down", user.gender)
      : available[0]!);
  const defaultMax: PadelLevel =
    user.matchLevelMax ??
    (user.level !== null
      ? stepLevel(user.level, "up", user.gender)
      : available[available.length - 1]!);

  return (
    <>
      <Form
        id={FORM_ID}
        method="post"
        key={user.gender ?? "none"}
        className="space-y-5"
      >
        <header>
          <h2 className="text-2xl font-bold leading-tight">
            Met wie wil je spelen?
          </h2>
        </header>

        <fieldset className="space-y-2">
          <legend className="sr-only">Speelvoorkeur</legend>
          {MATCH_PREFERENCE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-input bg-background p-4 transition hover:bg-secondary/40 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
            >
              <input
                type="radio"
                name="matchPreference"
                value={option.value}
                defaultChecked={user.matchPreference === option.value}
                onChange={() => setPreference(option.value)}
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

        {preference === "level_only" && user.gender !== null && (
          <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Range
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <RangeSelect
                name="matchLevelMin"
                label="Min"
                options={available}
                defaultValue={defaultMin}
              />
              <RangeSelect
                name="matchLevelMax"
                label="Max"
                options={available}
                defaultValue={defaultMax}
              />
            </div>
          </div>
        )}

        {actionData?.ok === false &&
          actionData.error === "preference_required" && (
            <p className="text-sm text-destructive">
              Kies een voorkeur om verder te gaan.
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

function RangeSelect({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: readonly PadelLevel[];
  defaultValue: PadelLevel;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((level) => (
          <option key={level} value={level}>
            {formatPadelLevel(level)}
          </option>
        ))}
      </select>
    </label>
  );
}
