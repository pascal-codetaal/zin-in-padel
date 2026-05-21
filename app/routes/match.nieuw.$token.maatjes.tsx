import { Form, Link, redirect, useNavigation } from "react-router";
import {
  nextMatchStep,
  prevMatchStep,
  useMatchWizardData,
} from "./match.nieuw.$token";
import { requireDraftFor } from "~/lib/match-wizard.server";
import { getDatabase, updateMatchDraft } from "~/lib/db.server";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/match.nieuw.$token.maatjes";

const STEP_SLUG = "maatjes" as const;
const PREV_SLUG = prevMatchStep(STEP_SLUG)!;
const NEXT_SLUG = nextMatchStep(STEP_SLUG)!;

type FavoritePlayerView = {
  ref: string;
  name: string;
  phone: string;
};

export async function loader({ params }: Route.LoaderArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const db = await getDatabase();
  const players: FavoritePlayerView[] = user.favoritePlayerRefs.map((ref) => {
    const p = db.players.find((p) => p.ref === ref);
    return p
      ? { ref: p.ref, name: p.name, phone: p.phone }
      : { ref, name: "Onbekende speler", phone: ref };
  });
  return {
    players,
    invitedFriendRefs: draft.invitedFriendRefs,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { user, draft } = await requireDraftFor(params.token);
  const form = await request.formData();
  const selected = form
    .getAll("invitedFriendRefs")
    .map((v) => v.toString())
    .filter((ref) => user.favoritePlayerRefs.includes(ref));
  await updateMatchDraft(draft.id, { invitedFriendRefs: selected });
  return redirect(`/match/nieuw/${params.token}/${NEXT_SLUG}`);
}

const FORM_ID = "step-maatjes";

export default function MaatjesStep({ loaderData }: Route.ComponentProps) {
  const { token } = useMatchWizardData();
  const { players, invitedFriendRefs } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const invitedSet = new Set(invitedFriendRefs);

  return (
    <>
      <Form id={FORM_ID} method="post" className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">
            Wie wil je uitnodigen?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Vink je maatjes aan. Ze krijgen als eerste een uitnodiging.
          </p>
        </header>

        {players.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Nog geen maatjes toegevoegd.{" "}
            <Link
              to={`/maatjes/${token}`}
              className="font-medium text-foreground underline"
            >
              Voeg er eerst toe →
            </Link>
          </p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="sr-only">Maatjes</legend>
            {players.map((player) => (
              <label
                key={player.ref}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border border-input bg-background p-4 transition hover:bg-secondary/40 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
              >
                <input
                  type="checkbox"
                  name="invitedFriendRefs"
                  value={player.ref}
                  defaultChecked={invitedSet.has(player.ref)}
                  className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {player.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {player.phone}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
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
          to: `/match/nieuw/${token}/${PREV_SLUG}`,
          label: "← Terug",
        }}
      />
    </>
  );
}
