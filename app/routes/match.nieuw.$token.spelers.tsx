import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { isMaatjeCourtFull } from "~/lib/match-picker";
import { MatchCourtPicker } from "~/components/match-court-picker";
import { MatchNewPlayerButton } from "~/components/match-new-player-button";
import {
  nextMatchStep,
  prevMatchStep,
  useMatchWizardData,
} from "./match.nieuw.$token";
import { requireDraftFor } from "~/lib/match-wizard.server";
import {
  applyConfirmedSlots,
  getMatchPickerPlayers,
  maatjeSlotsFromDraft,
  parseMaatjeSlotsForm,
} from "~/lib/match-picker.server";
import { formatPersonName } from "~/lib/person-name";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/match.nieuw.$token.spelers";

const STEP_SLUG = "spelers" as const;
const PREV_SLUG = prevMatchStep(STEP_SLUG);
const NEXT_SLUG = nextMatchStep(STEP_SLUG)!;

export async function loader({ params }: Route.LoaderArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const players = await getMatchPickerPlayers(user.id);
  const organizerName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: "Jij",
  });
  return {
    players,
    defaultSlots: maatjeSlotsFromDraft(
      organizerName,
      draft.confirmedSlotNames,
      players,
    ),
    organizerLevel: user.level,
    organizerName,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const form = await request.formData();
  const players = await getMatchPickerPlayers(user.id);
  const slots = parseMaatjeSlotsForm(form, user.favoritePlayerRefs);
  if (isMaatjeCourtFull(slots)) {
    return { ok: false as const, error: "court_full" };
  }
  const organizerName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: "Jij",
  });
  await applyConfirmedSlots(draft.id, organizerName, players, slots);
  return redirect(`/match/nieuw/${params.token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-spelers";

export default function SpelersStep({ loaderData }: Route.ComponentProps) {
  const { token, organizer } = useMatchWizardData();
  const { players, defaultSlots, organizerLevel, organizerName } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const [courtFull, setCourtFull] = useState(
    () => isMaatjeCourtFull(defaultSlots),
  );
  const cannotContinue = courtFull || players.length === 0;

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">Wie speelt mee?</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Deze spelers hebben al gezegd dat ze kunnen. Tik eerst een plek op de
            baan, daarna kies je de speler.
          </p>
        </header>

        {players.length === 0 ? (
          <div className="space-y-4">
            <p className="rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground">
              Nog geen vrienden in je lijst. Maak een speler aan om verder te
              gaan.
            </p>
            <MatchNewPlayerButton href={`/maatjes/${token}`} />
          </div>
        ) : (
          <MatchCourtPicker
            organizerName={organizerName}
            organizerLevel={organizerLevel}
            players={players}
            defaultSlots={defaultSlots}
            maatjesHref={`/maatjes/${token}`}
            onCourtStateChange={({ courtFull: full }) => setCourtFull(full)}
          />
        )}
      </Form>

      <StepFooter
        primary={{
          type: "submit",
          form: FORM_ID,
          label: "Volgende: uitnodigingsplan →",
          busyLabel: "Opslaan…",
          busy: isSubmitting,
          disabled: cannotContinue,
        }}
        secondary={
          PREV_SLUG
            ? {
                kind: "link",
                to: `/match/nieuw/${token}/${PREV_SLUG}`,
                label: "← Terug",
              }
            : {
                kind: "link",
                to: `/match/nieuw/${token}`,
                label: "← Terug",
              }
        }
      />
    </>
  );
}
