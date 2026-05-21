import { Form, redirect, useNavigation } from "react-router";
import { MatchInvitePicker } from "~/components/match-invite-picker";
import {
  nextMatchStep,
  prevMatchStep,
  useMatchWizardData,
} from "./match.nieuw.$token";
import { requireDraftFor } from "~/lib/match-wizard.server";
import { MAX_COURT_SLOTS } from "~/lib/match-picker";
import {
  applyInvitedRefs,
  getMatchPickerPlayers,
  maatjeSlotsFromDraft,
  parseInvitedRefsForm,
} from "~/lib/match-picker.server";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/match.nieuw.$token.maatjes";

const STEP_SLUG = "maatjes" as const;
const PREV_SLUG = prevMatchStep(STEP_SLUG)!;
const NEXT_SLUG = nextMatchStep(STEP_SLUG)!;

export async function loader({ params }: Route.LoaderArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const players = await getMatchPickerPlayers(user.id);
  const slots = maatjeSlotsFromDraft(
    user.profileName,
    draft.confirmedSlotNames,
    players,
  );
  const onCourtRefs = slots.filter((r): r is string => r !== null);
  const openSlots = Math.max(0, MAX_COURT_SLOTS - draft.confirmedSlotNames.length);

  return {
    players,
    onCourtRefs,
    invitedFriendRefs: draft.invitedFriendRefs,
    openSlots,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const form = await request.formData();
  const players = await getMatchPickerPlayers(user.id);
  const slots = maatjeSlotsFromDraft(
    user.profileName,
    draft.confirmedSlotNames,
    players,
  );
  const onCourtRefs = slots.filter((r): r is string => r !== null);
  const invitedRefs = parseInvitedRefsForm(
    form,
    user.favoritePlayerRefs,
    onCourtRefs,
  );
  await applyInvitedRefs(draft.id, invitedRefs);
  return redirect(`/match/nieuw/${params.token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-maatjes";

export default function MaatjesStep({ loaderData }: Route.ComponentProps) {
  const { token } = useMatchWizardData();
  const { players, onCourtRefs, invitedFriendRefs, openSlots } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">Wie nodig je uit?</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Kies maatjes die je via WhatsApp wilt vragen voor de open plekken op
            de baan.
          </p>
        </header>

        <MatchInvitePicker
          players={players}
          onCourtRefs={onCourtRefs}
          defaultInvitedRefs={invitedFriendRefs}
          openSlots={openSlots}
          maatjesHref={`/maatjes/${token}`}
        />
      </Form>

      <StepFooter
        primary={{
          type: "submit",
          form: FORM_ID,
          label: "Volgende: wanneer & waar →",
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
