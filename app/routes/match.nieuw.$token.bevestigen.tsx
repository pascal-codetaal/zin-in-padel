import type { ReactNode } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";
import { prevWizardStep, useMatchWizardData } from "./match.nieuw.$token";
import { requireDraftFor } from "~/lib/match-wizard.server";
import {
  finalizeMatchDraft,
  getDatabase,
} from "~/lib/db.server";
import {
  dispatchOrEnqueueInvites,
  scheduleCascadeFallbackEvents,
} from "~/lib/cascade/dispatch.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import {
  formatMatchFormat,
  formatPadelLevel,
  type PadelLevel,
} from "~/types/domain";
import { StepFooter } from "~/components/step-footer";
import { displayFriendName } from "~/lib/friend-name.server";
import { buildMatchDetailUrl } from "~/lib/vrienden-url.server";
import {
  CourtCard,
  InfoCard,
} from "~/components/match-live-overview";
import { buildLiveMatchOverviewData } from "~/lib/match-live-overview.server";
import type { Route } from "./+types/match.nieuw.$token.bevestigen";

const STEP_SLUG = "bevestigen" as const;

export async function loader({ params }: Route.LoaderArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const [overview, db] = await Promise.all([
    buildLiveMatchOverviewData(draft, user, null),
    getDatabase(),
  ]);
  const invitedPlayers = draft.invitedFriendRefs.map((ref) => {
    const p = db.players.find((p) => p.ref === ref);
    return {
      ref,
      name: displayFriendName(user.favoriteNames, ref, p, db.users, "Onbekende speler"),
    };
  });

  return {
    draft: {
      scheduledAt: draft.scheduledAt,
      durationMinutes: draft.durationMinutes,
      format: draft.format,
      totalSlots: draft.totalSlots,
      confirmedSlotNames: draft.confirmedSlotNames,
      inviteFriendsEnabled: draft.inviteFriendsEnabled,
      fallbackToLevelRange: draft.fallbackToLevelRange,
      fallbackLevelMin: draft.fallbackLevelMin,
      fallbackLevelMax: draft.fallbackLevelMax,
      fallbackLevelDelayMinutes: draft.fallbackLevelDelayMinutes,
      fallbackToEveryone: draft.fallbackToEveryone,
      fallbackEveryoneDelayMinutes: draft.fallbackEveryoneDelayMinutes,
    },
    overview,
    invitedPlayers,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { draft } = await requireDraftFor(params.token);

  if (!draft.scheduledAt || draft.clubIds.length === 0) {
    return redirect(`/match/nieuw/${params.token}/wanneer`);
  }

  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  if (intent === "create") {
    const finalized = await finalizeMatchDraft(draft.id, "open");
    await dispatchOrEnqueueInvites(finalized.id, new Date());
    await scheduleCascadeFallbackEvents(finalized.id);
    return redirect(
      buildMatchDetailUrl(request, params.token!, finalized.id),
    );
  }

  return { ok: false as const, error: "unknown_intent" };
}

const FORM_ID = "step-bevestigen";

export default function BevestigenStep({
  loaderData,
}: Route.ComponentProps) {
  const { token } = useMatchWizardData();
  const { draft, overview, invitedPlayers } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const slotLabel =
    overview.openSlots === 0
      ? `${overview.totalSlots}/${overview.totalSlots} spelers - volzet`
      : `${overview.filledSlots}/${overview.totalSlots} spelers - ${overview.openSlots} open`;
  const locationLabel =
    overview.clubs.length === 0
      ? "Nog niet gekozen"
      : overview.clubs.map((club) => `${club.name} - ${club.city}`).join(" / ");
  const invitedLabel =
    invitedPlayers.length === 0
      ? "Geen vrienden geselecteerd"
      : `${invitedPlayers.length} uitgenodigd (${invitedPlayers
          .map((p) => p.name)
          .slice(0, 4)
          .join(", ")}${invitedPlayers.length > 4 ? "..." : ""})`;
  const prevSlug = prevWizardStep(STEP_SLUG, {
    inviteFriendsEnabled: draft.inviteFriendsEnabled,
  })!;

  return (
    <>
      <section className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">Klaar om te versturen?</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Check de details en bevestig.
          </p>
        </header>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <MatchMetaPill>{formatScheduledAt(draft.scheduledAt)}</MatchMetaPill>
            <MatchMetaPill>{formatMatchFormat(draft.format)}</MatchMetaPill>
            <MatchMetaPill>{draft.durationMinutes} min</MatchMetaPill>
          </div>

          <section className="space-y-3">
            <div>
              <h3 className="text-2xl font-bold leading-tight">Wie speelt mee?</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Zo ziet de baan eruit zodra je de match aanmaakt.
              </p>
            </div>
            <CourtCard
              match={overview}
              canRemove={false}
              isSubmitting={isSubmitting}
            />
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            <InfoCard label="Locatie">{locationLabel}</InfoCard>
            <InfoCard label="Details">
              {formatMatchFormat(draft.format)} · {draft.durationMinutes} min ·{" "}
              {slotLabel}
            </InfoCard>
            <InfoCard label="Uitgenodigd">{invitedLabel}</InfoCard>
            <InfoCard label="Uitnodigingen">{renderCascade(draft)}</InfoCard>
          </section>

          <div className="flex flex-wrap justify-end gap-3 text-xs font-medium">
            <Link
              to={`/match/nieuw/${token}/wanneer`}
              className="text-muted-foreground transition hover:text-foreground"
            >
              Wanneer/waar aanpassen
            </Link>
            <Link
              to={`/match/nieuw/${token}/spelers`}
              className="text-muted-foreground transition hover:text-foreground"
            >
              Spelers aanpassen
            </Link>
            <Link
              to={`/match/nieuw/${token}/maatjes`}
              className="text-muted-foreground transition hover:text-foreground"
            >
              Vrienden aanpassen
            </Link>
          </div>
        </div>

        {invitedPlayers.length === 0 &&
          draft.inviteFriendsEnabled &&
          !draft.fallbackToLevelRange && (
            <p className="rounded-2xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Je hebt niemand geselecteerd én geen zoeklaag op niveau. Niemand
              zal een uitnodiging krijgen.{" "}
              <Link
                to={`/match/nieuw/${token}/uitnodigen`}
                className="font-medium underline"
              >
                Pas aan →
              </Link>
            </p>
          )}
      </section>

      <Form id={FORM_ID} method="post" className="hidden">
        <input type="hidden" name="intent" value="create" />
      </Form>

      <StepFooter
        primary={{
          type: "submit",
          form: FORM_ID,
          label: "Match aanmaken ✓",
          busyLabel: "Versturen…",
          busy: isSubmitting,
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

function MatchMetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function renderCascade(draft: {
  fallbackToLevelRange: boolean;
  fallbackLevelMin: PadelLevel | null;
  fallbackLevelMax: PadelLevel | null;
  fallbackLevelDelayMinutes: number;
  fallbackToEveryone: boolean;
  fallbackEveryoneDelayMinutes: number;
}): string {
  const parts: string[] = ["Vrienden (nu)"];
  if (draft.fallbackToLevelRange) {
    const min = draft.fallbackLevelMin
      ? formatPadelLevel(draft.fallbackLevelMin)
      : "?";
    const max = draft.fallbackLevelMax
      ? formatPadelLevel(draft.fallbackLevelMax)
      : "?";
    parts.push(
      `P ${min}–${max} (+${draft.fallbackLevelDelayMinutes} min)`,
    );
  }
  if (draft.fallbackToEveryone) {
    parts.push(`Iedereen (+${draft.fallbackEveryoneDelayMinutes} min)`);
  }
  return parts.join(" → ");
}
