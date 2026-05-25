import { useMemo } from "react";
import {
  data,
  Form,
  redirect,
  useFetcher,
  useNavigation,
  useSearchParams,
} from "react-router";
import { prevStepSlug, useProfielData } from "./profiel.$token";
import { findUserByManageToken, updateUserProfile } from "~/lib/db.server";
import { isProfielFormComplete } from "~/lib/profiel-completion";
import { finishProfielFromWeb } from "~/lib/profiel-completion.server";
import { loadClubs } from "~/lib/clubs.server";
import { StepFooter } from "~/components/step-footer";
import type { Route } from "./+types/profiel.$token.clubs";

const STEP_SLUG = "clubs" as const;
const PREV_SLUG = prevStepSlug(STEP_SLUG)!;

type ClubOption = {
  id: string;
  name: string;
  city: string;
  province?: string;
};

type ClubsActionResponse =
  | { ok: true; intent: "add-club" | "remove-club" }
  | { ok: false; error: string };

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token?.trim();
  if (!token) throw data("Not Found", { status: 404 });
  const clubs = await loadClubs();
  return {
    clubs: clubs.map(
      (c): ClubOption => ({
        id: c.id,
        name: c.name,
        city: c.city,
        province: c.province,
      }),
    ),
  };
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<Response | ClubsActionResponse> {
  const token = params.token?.trim();
  if (!token) return { ok: false, error: "missing_token" };
  const user = await findUserByManageToken(token);
  if (!user) return { ok: false, error: "user_not_found" };

  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  if (intent === "add-club") {
    const clubId = form.get("clubId")?.toString().trim();
    if (!clubId) return { ok: false, error: "missing_club_id" };
    if (!user.preferredClubIds.includes(clubId)) {
      await updateUserProfile(user.id, {
        preferredClubIds: [...user.preferredClubIds, clubId],
      });
    }
    return { ok: true, intent: "add-club" };
  }

  if (intent === "remove-club") {
    const clubId = form.get("clubId")?.toString().trim();
    if (!clubId) return { ok: false, error: "missing_club_id" };
    await updateUserProfile(user.id, {
      preferredClubIds: user.preferredClubIds.filter((id) => id !== clubId),
    });
    return { ok: true, intent: "remove-club" };
  }

  if (intent === "finish") {
    const result = await finishProfielFromWeb(user.id, request);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return redirect(`/profiel/${token}`);
  }

  return { ok: false, error: "unknown_intent" };
}

const FORM_ID = "step-clubs-finish";

export default function ClubsStep({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { token, user } = useProfielData();
  const { clubs } = loaderData;
  const navigation = useNavigation();
  const finishing =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "finish";
  const canFinish = isProfielFormComplete(user);

  const preferredClubs = useMemo(
    () =>
      user.preferredClubIds
        .map((id) => clubs.find((c) => c.id === id))
        .filter((c): c is ClubOption => Boolean(c)),
    [clubs, user.preferredClubIds],
  );

  return (
    <>
      <section className="space-y-5">
        <header>
          <h2 className="text-2xl font-bold leading-tight">
            Waar speel je?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Zoek je clubs en voeg ze toe. Je kan er meerdere kiezen.
          </p>
        </header>

        <ClubSearch
          allClubs={clubs}
          preferredIds={new Set(user.preferredClubIds)}
        />

        <SelectedClubs preferredClubs={preferredClubs} />

        {actionData?.ok === false && actionData.error === "profiel_incomplete" && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Vul eerst alle stappen in (basis, kant, voorkeur en minstens één
            club).
          </p>
        )}
      </section>

      {/* Finish form holds only the intent and the submit button (in the footer). */}
      <Form id={FORM_ID} method="post" className="hidden">
        <input type="hidden" name="intent" value="finish" />
      </Form>

      <StepFooter
        primary={{
          type: "submit",
          form: FORM_ID,
          label: "Profiel afronden ✓",
          busyLabel: "Bezig…",
          busy: finishing,
          disabled: !canFinish,
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

const CLUB_SEARCH_PARAM = "q";

function ClubSearch({
  allClubs,
  preferredIds,
}: {
  allClubs: ClubOption[];
  preferredIds: Set<string>;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<ClubsActionResponse>();
  const query = searchParams.get(CLUB_SEARCH_PARAM) ?? "";

  const addingClubId =
    fetcher.state !== "idle"
      ? fetcher.formData?.get("clubId")?.toString()
      : undefined;

  function setQuery(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const trimmed = value.trim();
        if (trimmed) {
          next.set(CLUB_SEARCH_PARAM, value);
        } else {
          next.delete(CLUB_SEARCH_PARAM);
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  function addClub(clubId: string) {
    const formData = new FormData();
    formData.set("intent", "add-club");
    formData.set("clubId", clubId);
    fetcher.submit(formData, {
      method: "post",
      preventScrollReset: true,
    });
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return allClubs
      .filter((club) => {
        if (preferredIds.has(club.id)) return false;
        const haystack =
          `${club.name} ${club.city} ${club.province ?? ""}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 20);
  }, [query, allClubs, preferredIds]);

  const showResults = query.trim().length >= 2;

  return (
    <div>
      <label className="block">
        <span className="sr-only">Club zoeken</span>
        <input
          type="text"
          name={CLUB_SEARCH_PARAM}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          placeholder="Zoek op club of gemeente…"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      {showResults && (
        <div className="mt-3 max-h-64 overflow-auto rounded-2xl border border-border bg-background">
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Geen clubs gevonden voor "{query}".
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {matches.map((club) => (
                <ClubSearchResultRow
                  key={club.id}
                  club={club}
                  onAdd={() => addClub(club.id)}
                  isAdding={addingClubId === club.id}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SelectedClubs({
  preferredClubs,
}: {
  preferredClubs: ClubOption[];
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Jouw clubs ({preferredClubs.length})
      </p>
      {preferredClubs.length === 0 ? (
        <p className="mt-2 rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-4 text-center text-xs text-muted-foreground">
          Nog geen clubs gekozen.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {preferredClubs.map((club) => (
            <PreferredClubRow key={club.id} club={club} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ClubSearchResultRow({
  club,
  onAdd,
  isAdding,
}: {
  club: ClubOption;
  onAdd: () => void;
  isAdding: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{club.name}</p>
        <p className="text-xs text-muted-foreground">
          {club.city}
          {club.province ? ` · ${club.province}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={isAdding}
        className="inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        {isAdding ? "Bezig…" : "Toevoegen"}
      </button>
    </li>
  );
}

function PreferredClubRow({ club }: { club: ClubOption }) {
  const fetcher = useFetcher<ClubsActionResponse>();
  const isRemoving = fetcher.state !== "idle";

  function removeClub() {
    const formData = new FormData();
    formData.set("intent", "remove-club");
    formData.set("clubId", club.id);
    fetcher.submit(formData, { method: "post", preventScrollReset: true });
  }

  return (
    <li
      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
      style={{ opacity: isRemoving ? 0.5 : 1 }}
    >
      <div>
        <p className="text-sm font-medium">{club.name}</p>
        <p className="text-xs text-muted-foreground">
          {club.city}
          {club.province ? ` · ${club.province}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={removeClub}
        disabled={isRemoving}
        className="text-sm text-muted-foreground transition hover:text-destructive disabled:opacity-50"
      >
        {isRemoving ? "Bezig…" : "Verwijderen"}
      </button>
    </li>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
