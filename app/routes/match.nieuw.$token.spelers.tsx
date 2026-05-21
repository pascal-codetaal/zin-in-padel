import { Form, Link, redirect, useNavigation } from "react-router";
import { MatchCourtPicker } from "~/components/match-court-picker";
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
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/match.nieuw.$token.spelers";

const STEP_SLUG = "spelers" as const;
const PREV_SLUG = prevMatchStep(STEP_SLUG);
const NEXT_SLUG = nextMatchStep(STEP_SLUG)!;

export async function loader({ params }: Route.LoaderArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const players = await getMatchPickerPlayers(user.id);
  return {
    players,
    defaultSlots: maatjeSlotsFromDraft(
      user.profileName,
      draft.confirmedSlotNames,
      players,
    ),
    organizerLevel: user.level,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const form = await request.formData();
  const players = await getMatchPickerPlayers(user.id);
  const slots = parseMaatjeSlotsForm(form, user.favoritePlayerRefs);
  await applyConfirmedSlots(draft.id, user.profileName, players, slots);
  return redirect(`/match/nieuw/${params.token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-spelers";

export default function SpelersStep({ loaderData }: Route.ComponentProps) {
  const { token, organizer } = useMatchWizardData();
  const { players, defaultSlots, organizerLevel } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

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
          <p className="rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Nog geen maatjes in je lijst.{" "}
            <Link
              to={`/maatjes/${token}`}
              className="font-medium text-foreground underline"
            >
              Voeg maatjes toe →
            </Link>
          </p>
        ) : (
          <MatchCourtPicker
            organizerName={organizer.profileName || "Jij"}
            organizerLevel={organizerLevel}
            players={players}
            defaultSlots={defaultSlots}
            maatjesHref={`/maatjes/${token}`}
          />
        )}
      </Form>

      <StepFooter
        primary={{
          type: "submit",
          form: FORM_ID,
          label: "Volgende: uitnodigen →",
          busyLabel: "Opslaan…",
          busy: isSubmitting,
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
