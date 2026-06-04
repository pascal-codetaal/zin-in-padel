import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { MatchCascadeSettings } from "~/components/match-cascade-settings";
import { parseCascadeFromForm } from "~/lib/match-cascade-form.server";
import {
  nextWizardStep,
  prevMatchStep,
  useMatchWizardData,
} from "./match.nieuw.$token";
import { requireDraftFor } from "~/lib/match-wizard.server";
import { updateMatchDraft } from "~/lib/db.server";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/match.nieuw.$token.uitnodigen";

const STEP_SLUG = "uitnodigen" as const;
const PREV_SLUG = prevMatchStep(STEP_SLUG)!;

export async function loader({ params }: Route.LoaderArgs) {
  const { draft } = await requireDraftFor(params.token);
  return {
    invitedCount: draft.invitedFriendRefs.length,
    inviteFriendsEnabled: draft.inviteFriendsEnabled,
    fallbackToLevelRange: draft.fallbackToLevelRange,
    fallbackLevelMin: draft.fallbackLevelMin,
    fallbackLevelMax: draft.fallbackLevelMax,
    fallbackLevelDelayMinutes: draft.fallbackLevelDelayMinutes,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const form = await request.formData();

  const inviteFriendsEnabled = form.get("inviteFriendsEnabled") === "on";
  const cascade = parseCascadeFromForm(form, {
    gender: user.gender,
    level: user.level,
    matchLevelMin: user.matchLevelMin,
    matchLevelMax: user.matchLevelMax,
  });

  const saved = await updateMatchDraft(draft.id, {
    ...(inviteFriendsEnabled ? {} : { invitedFriendRefs: [] }),
    ...cascade,
  });

  const nextSlug = nextWizardStep(STEP_SLUG, saved)!;
  return redirect(`/match/nieuw/${params.token}/${nextSlug}`);
}

const FORM_ID = "step-uitnodigen";

export default function UitnodigenStep({ loaderData }: Route.ComponentProps) {
  const { token, organizer } = useMatchWizardData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const [friendsOn, setFriendsOn] = useState(loaderData.inviteFriendsEnabled);

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">Uitnodigen</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Kies wie een uitnodiging krijgt en welke extra zoeklagen je
            inschakelt.
          </p>
        </header>

        <MatchCascadeSettings
          gender={organizer.gender}
          level={organizer.level}
          matchLevelMin={organizer.matchLevelMin}
          matchLevelMax={organizer.matchLevelMax}
          invitedCount={loaderData.invitedCount}
          inviteFriendsEnabled={friendsOn}
          onInviteFriendsChange={setFriendsOn}
          fallbackToLevelRange={loaderData.fallbackToLevelRange}
          fallbackLevelMin={loaderData.fallbackLevelMin}
          fallbackLevelMax={loaderData.fallbackLevelMax}
          fallbackLevelDelayMinutes={loaderData.fallbackLevelDelayMinutes}
        />
      </Form>

      <StepFooter
        primary={{
          type: "submit",
          form: FORM_ID,
          label: friendsOn
            ? "Volgende: vrienden selecteren →"
            : "Volgende: overzicht →",
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
