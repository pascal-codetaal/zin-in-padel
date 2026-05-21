import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import {
  nextMatchStep,
  prevMatchStep,
  useMatchWizardData,
} from "./match.nieuw.$token";
import { requireDraftFor } from "~/lib/match-wizard.server";
import { updateMatchDraft } from "~/lib/db.server";
import { parseLevel } from "~/lib/profile-form.server";
import {
  formatPadelLevel,
  levelsForGender,
  stepLevel,
  type PadelLevel,
} from "~/types/domain";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/match.nieuw.$token.uitnodigingen";

const STEP_SLUG = "uitnodigingen" as const;
const PREV_SLUG = prevMatchStep(STEP_SLUG)!;
const NEXT_SLUG = nextMatchStep(STEP_SLUG)!;

export async function loader({ params }: Route.LoaderArgs) {
  const { draft } = await requireDraftFor(params.token);
  return {
    draft: {
      invitedCount: draft.invitedFriendRefs.length,
      fallbackToLevelRange: draft.fallbackToLevelRange,
      fallbackLevelMin: draft.fallbackLevelMin,
      fallbackLevelMax: draft.fallbackLevelMax,
      fallbackLevelDelayMinutes: draft.fallbackLevelDelayMinutes,
      fallbackToEveryone: draft.fallbackToEveryone,
      fallbackEveryoneDelayMinutes: draft.fallbackEveryoneDelayMinutes,
    },
  };
}

function parseDelay(value: FormDataEntryValue | null, fallback: number): number {
  if (value === null) return fallback;
  const n = Number.parseInt(value.toString(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 1440) return fallback;
  return n;
}

export async function action({ request, params }: Route.ActionArgs) {
  const { draft } = await requireDraftFor(params.token);
  const form = await request.formData();

  const fallbackToLevelRange = form.get("fallbackToLevelRange") === "on";
  const fallbackToEveryone = form.get("fallbackToEveryone") === "on";

  const min = fallbackToLevelRange ? parseLevel(form.get("fallbackLevelMin")) : null;
  const max = fallbackToLevelRange ? parseLevel(form.get("fallbackLevelMax")) : null;
  const levelDelay = parseDelay(form.get("fallbackLevelDelayMinutes"), 30);
  const everyoneDelay = parseDelay(form.get("fallbackEveryoneDelayMinutes"), 60);

  await updateMatchDraft(draft.id, {
    fallbackToLevelRange,
    fallbackLevelMin: fallbackToLevelRange ? min : null,
    fallbackLevelMax: fallbackToLevelRange ? max : null,
    fallbackLevelDelayMinutes: levelDelay,
    fallbackToEveryone,
    fallbackEveryoneDelayMinutes: everyoneDelay,
  });
  return redirect(`/match/nieuw/${params.token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-uitnodigingen";

export default function UitnodigingenStep({
  loaderData,
}: Route.ComponentProps) {
  const { token, organizer } = useMatchWizardData();
  const { draft } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  const available = levelsForGender(organizer.gender);
  const defaultMin: PadelLevel =
    draft.fallbackLevelMin ??
    organizer.matchLevelMin ??
    (organizer.level !== null
      ? stepLevel(organizer.level, "down", organizer.gender)
      : available[0]!);
  const defaultMax: PadelLevel =
    draft.fallbackLevelMax ??
    organizer.matchLevelMax ??
    (organizer.level !== null
      ? stepLevel(organizer.level, "up", organizer.gender)
      : available[available.length - 1]!);

  const [rangeOn, setRangeOn] = useState(draft.fallbackToLevelRange);

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">
            Wie krijgt een uitnodiging?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            We sturen in golven: eerst je maatjes, daarna de optionele lagen.
          </p>
        </header>

        <CascadeStep
          number={1}
          title="Je maatjes"
          sub={`${draft.invitedCount} geselecteerd in de vorige stap`}
          locked
        />

        <CascadeStep
          number={2}
          title="Spelers in een klassement-range"
          sub="Indien nodig sturen we een 2e golf naar spelers met een passend P-klassement."
        >
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="fallbackToLevelRange"
              defaultChecked={draft.fallbackToLevelRange}
              onChange={(e) => setRangeOn(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--accent)]"
            />
            <span className="text-sm font-medium">Inschakelen</span>
          </label>

          {rangeOn && organizer.gender !== null && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <RangeSelect
                  name="fallbackLevelMin"
                  label="Min"
                  options={available}
                  defaultValue={defaultMin}
                />
                <RangeSelect
                  name="fallbackLevelMax"
                  label="Max"
                  options={available}
                  defaultValue={defaultMax}
                />
              </div>
              <DelaySelect
                name="fallbackLevelDelayMinutes"
                defaultValue={draft.fallbackLevelDelayMinutes}
                label="Activeren na"
              />
            </>
          )}
          {rangeOn && organizer.gender === null && (
            <p className="mt-2 text-xs text-amber-700">
              Stel eerst je geslacht in je profiel in om een P-range te kiezen.
            </p>
          )}
        </CascadeStep>

        <CascadeStep
          number={3}
          title="Iedereen"
          sub="Als laatste redmiddel sturen we ook naar alle andere PadelMatch-spelers."
        >
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="fallbackToEveryone"
              defaultChecked={draft.fallbackToEveryone}
              className="h-4 w-4 accent-[color:var(--accent)]"
            />
            <span className="text-sm font-medium">Inschakelen</span>
          </label>
          <DelaySelect
            name="fallbackEveryoneDelayMinutes"
            defaultValue={draft.fallbackEveryoneDelayMinutes}
            label="Activeren na"
          />
        </CascadeStep>
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

function CascadeStep({
  number,
  title,
  sub,
  locked,
  children,
}: {
  number: number;
  title: string;
  sub: string;
  locked?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border bg-card p-4 ${
        locked ? "border-accent/40 bg-accent/5" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
          {number}
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </section>
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

const DELAY_OPTIONS = [0, 15, 30, 60, 120, 240] as const;

function DelaySelect({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number;
}) {
  return (
    <label className="mt-3 block">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {DELAY_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m === 0 ? "Onmiddellijk" : `${m} min`}
          </option>
        ))}
      </select>
    </label>
  );
}
