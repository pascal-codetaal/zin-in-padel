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
import { getClubsByIds } from "~/lib/clubs.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import {
  formatMatchFormat,
  formatPadelLevel,
  openSlotsOf,
  type PadelLevel,
} from "~/types/domain";
import { StepFooter } from "~/components/step-footer";
import { displayFriendName } from "~/lib/friend-name.server";
import type { Route } from "./+types/match.nieuw.$token.bevestigen";

const STEP_SLUG = "bevestigen" as const;

export async function loader({ params }: Route.LoaderArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const [clubs, db] = await Promise.all([
    getClubsByIds(draft.clubIds),
    getDatabase(),
  ]);
  const invitedPlayers = draft.invitedFriendRefs.map((ref) => {
    const p = db.players.find((p) => p.ref === ref);
    return {
      ref,
      name: displayFriendName(user.favoriteNames, ref, p, db.users, "Onbekende speler"),
    };
  });
  const openSlots = openSlotsOf(draft);

  return {
    draft: {
      scheduledAt: draft.scheduledAt,
      durationMinutes: draft.durationMinutes,
      format: draft.format,
      totalSlots: draft.totalSlots,
      confirmedSlotNames: draft.confirmedSlotNames,
      openSlots,
      inviteFriendsEnabled: draft.inviteFriendsEnabled,
      fallbackToLevelRange: draft.fallbackToLevelRange,
      fallbackLevelMin: draft.fallbackLevelMin,
      fallbackLevelMax: draft.fallbackLevelMax,
      fallbackLevelDelayMinutes: draft.fallbackLevelDelayMinutes,
      fallbackToEveryone: draft.fallbackToEveryone,
      fallbackEveryoneDelayMinutes: draft.fallbackEveryoneDelayMinutes,
    },
    clubs: clubs.map((c) => ({ id: c.id, name: c.name, city: c.city })),
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
    return redirect(`/match/${params.token}?created=${finalized.id}`);
  }

  return { ok: false as const, error: "unknown_intent" };
}

const FORM_ID = "step-bevestigen";

export default function BevestigenStep({
  loaderData,
}: Route.ComponentProps) {
  const { token } = useMatchWizardData();
  const { draft, clubs, invitedPlayers } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
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

        <ul className="space-y-2">
          <SummaryRow
            label="Wanneer"
            value={`${formatScheduledAt(draft.scheduledAt)} · ${draft.durationMinutes} min`}
            editTo={`/match/nieuw/${token}/wanneer`}
          />
          <SummaryRow
            label="Waar"
            value={
              clubs.length === 0
                ? "—"
                : clubs.map((c) => `${c.name} · ${c.city}`).join(" · ")
            }
            editTo={`/match/nieuw/${token}/wanneer`}
          />
          <SummaryRow
            label="Formaat"
            value={formatMatchFormat(draft.format)}
            editTo={`/match/nieuw/${token}/formaat`}
          />
          <SummaryRow
            label="Spelen mee"
            value={
              draft.confirmedSlotNames.length === 0
                ? "—"
                : draft.confirmedSlotNames.join(", ")
            }
            editTo={`/match/nieuw/${token}/spelers`}
          />
          <SummaryRow
            label="Open plaatsen"
            value={
              draft.openSlots === 0
                ? `${draft.totalSlots}/${draft.totalSlots} (volzet)`
                : `${draft.totalSlots - draft.openSlots}/${draft.totalSlots} ingevuld · ${draft.openSlots} open`
            }
            editTo={`/match/nieuw/${token}/spelers`}
          />
          <SummaryRow
            label="Uitgenodigd"
            value={
              invitedPlayers.length === 0
                ? "Geen vrienden geselecteerd"
                : `${invitedPlayers.length} uitgenodigd, eerste 'ja' krijgt de plek (${invitedPlayers.map((p) => p.name).slice(0, 3).join(", ")}${invitedPlayers.length > 3 ? "…" : ""})`
            }
            editTo={`/match/nieuw/${token}/maatjes`}
          />
          <SummaryRow
            label="Zoeklagen"
            value={renderCascade(draft)}
            editTo={`/match/nieuw/${token}/uitnodigen`}
          />
        </ul>

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

function SummaryRow({
  label,
  value,
  editTo,
}: {
  label: string;
  value: string;
  editTo: string;
}) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-sm">{value}</p>
        </div>
        <Link
          to={editTo}
          className="flex-none text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          Bewerken
        </Link>
      </div>
    </li>
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
