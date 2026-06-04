import { useMemo, useState } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { MatchInvitePicker } from "~/components/match-invite-picker";
import { nextMatchStep, useMatchWizardData } from "./match.nieuw.$token";
import { requireDraftFor } from "~/lib/match-wizard.server";
import { MAX_COURT_SLOTS } from "~/lib/match-picker";
import {
  applyInvitedRefs,
  getMatchPickerPlayers,
  resolveMaatjesInvitedRefs,
  maatjeSlotsFromDraft,
  onCourtRefsForInviteStep,
  parseInvitedRefsForm,
} from "~/lib/match-picker.server";
import { formatPersonName } from "~/lib/person-name";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/match.nieuw.$token.vrienden";

const STEP_SLUG = "maatjes" as const;
const NEXT_SLUG = nextMatchStep(STEP_SLUG)!;

export async function loader({ params }: Route.LoaderArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  if (!draft.inviteFriendsEnabled) {
    return redirect(`/match/nieuw/${params.token}/bevestigen`);
  }
  const players = await getMatchPickerPlayers(user.id);
  const organizerName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: "Jij",
  });
  const slots = maatjeSlotsFromDraft(
    organizerName,
    draft.confirmedSlotNames,
    players,
  );
  const onCourtRefs = onCourtRefsForInviteStep({
    organizerName,
    confirmedSlotNames: draft.confirmedSlotNames,
    players,
    slotRefs: slots,
  });
  const openSlots = Math.max(0, MAX_COURT_SLOTS - draft.confirmedSlotNames.length);
  const invitedFriendRefs = resolveMaatjesInvitedRefs(
    players,
    onCourtRefs,
    draft.invitedFriendRefs,
  );

  return {
    players,
    onCourtRefs,
    invitedFriendRefs,
    openSlots,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const form = await request.formData();
  const players = await getMatchPickerPlayers(user.id);
  const organizerName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: "Jij",
  });
  const slots = maatjeSlotsFromDraft(
    organizerName,
    draft.confirmedSlotNames,
    players,
  );
  const onCourtRefs = onCourtRefsForInviteStep({
    organizerName,
    confirmedSlotNames: draft.confirmedSlotNames,
    players,
    slotRefs: slots,
  });
  const invitedRefs = parseInvitedRefsForm(
    form,
    user.favoritePlayerRefs,
    onCourtRefs,
    players,
  );
  if (invitedRefs.length === 0) {
    return { ok: false as const, error: "min_one_friend" };
  }
  await applyInvitedRefs(draft.id, invitedRefs);
  return redirect(`/match/nieuw/${params.token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-maatjes";

export default function VriendenStep({ loaderData }: Route.ComponentProps) {
  const { token } = useMatchWizardData();
  const { players, onCourtRefs, invitedFriendRefs, openSlots } = loaderData;
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const isSubmitting = navigation.state !== "idle";
  const prevSlug = "uitnodigen";

  const invitePoolCount = useMemo(
    () =>
      players.filter(
        (p) => !onCourtRefs.includes(p.ref) && p.isAppUser,
      ).length,
    [players, onCourtRefs],
  );
  const [invitedCount, setInvitedCount] = useState(invitedFriendRefs.length);
  const canContinue = invitedCount >= 1;

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">
            Welke vrienden nodig je uit voor de match?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Kies vrienden die je via WhatsApp wilt vragen voor de open plekken op
            de baan.
          </p>
        </header>

        <MatchInvitePicker
          players={players}
          onCourtRefs={onCourtRefs}
          defaultInvitedRefs={invitedFriendRefs}
          openSlots={openSlots}
          maatjesHref={`/maatjes/${token}`}
          onInvitedChange={setInvitedCount}
        />

        {!canContinue && invitePoolCount > 0 && openSlots > 0 && (
          <p className="text-sm text-amber-900">
            Selecteer minstens één vriend om verder te gaan.
          </p>
        )}
        {actionData?.ok === false && actionData.error === "min_one_friend" && (
          <p className="text-sm text-destructive">
            Selecteer minstens één vriend om verder te gaan.
          </p>
        )}
      </Form>

      <StepFooter
        primary={{
          type: "submit",
          form: FORM_ID,
          label: "Volgende: overzicht →",
          busyLabel: "Opslaan…",
          busy: isSubmitting,
          disabled: !canContinue,
        }}
        secondary={{
          kind: "link",
          to: `/match/nieuw/${token}/${prevSlug}`,
          label: "← Terug",
        }}
      />
    </>
  );
}
