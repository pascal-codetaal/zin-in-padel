import {
  data,
  Link,
  Outlet,
  useLocation,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/match.nieuw.$token";
import { PlayerAppHeader } from "~/components/player-app-header";
import { findUserByManageToken } from "~/lib/db.server";
import { formatPersonName } from "~/lib/person-name";
import type { Match, User } from "~/types/domain";

/* ---------- Steps ---------- */

export type MatchStepSlug =
  | "spelers"
  | "maatjes"
  | "wanneer"
  | "formaat"
  | "uitnodigen"
  | "bevestigen";

export const MATCH_STEPS: { slug: MatchStepSlug; shortTitle: string }[] = [
  { slug: "wanneer", shortTitle: "Wanneer" },
  { slug: "formaat", shortTitle: "Formaat" },
  { slug: "spelers", shortTitle: "Huidige spelers" },
  { slug: "uitnodigen", shortTitle: "Uitnodigen" },
  { slug: "maatjes", shortTitle: "Vrienden uitnodigen" },
  { slug: "bevestigen", shortTitle: "Overzicht" },
];

type WizardNavDraft = Pick<Match, "inviteFriendsEnabled"> | null;

/** Next step; skips vrienden selecteren when friends are disabled. */
export function nextWizardStep(
  slug: MatchStepSlug,
  draft: WizardNavDraft,
): MatchStepSlug | null {
  if (slug === "uitnodigen") {
    return draft?.inviteFriendsEnabled ? "maatjes" : "bevestigen";
  }
  return nextMatchStep(slug);
}

/** Previous step; skips vrienden selecteren when friends are disabled. */
export function prevWizardStep(
  slug: MatchStepSlug,
  draft: WizardNavDraft,
): MatchStepSlug | null {
  if (slug === "bevestigen") {
    return draft?.inviteFriendsEnabled ? "maatjes" : "uitnodigen";
  }
  if (slug === "maatjes") return "uitnodigen";
  return prevMatchStep(slug);
}

export function findMatchStepIndex(slug: MatchStepSlug): number {
  return MATCH_STEPS.findIndex((s) => s.slug === slug);
}

export function nextMatchStep(slug: MatchStepSlug): MatchStepSlug | null {
  const i = findMatchStepIndex(slug);
  if (i < 0 || i >= MATCH_STEPS.length - 1) return null;
  return MATCH_STEPS[i + 1]!.slug;
}

export function prevMatchStep(slug: MatchStepSlug): MatchStepSlug | null {
  const i = findMatchStepIndex(slug);
  if (i <= 0) return null;
  return MATCH_STEPS[i - 1]!.slug;
}

export function isMatchStepComplete(
  slug: MatchStepSlug,
  draft: Match | null,
): boolean {
  if (!draft) return false;
  if (slug === "spelers") return true;
  if (slug === "maatjes") return true;
  if (slug === "uitnodigen") return true;
  if (slug === "wanneer")
    return draft.scheduledAt !== null && draft.clubIds.length > 0;
  if (slug === "formaat") return true; // always has a value
  if (slug === "bevestigen") return draft.status !== "draft";
  return false;
}

/* ---------- Loader ---------- */

export type MatchOrganizer = Pick<
  User,
  | "id"
  | "profileName"
  | "firstName"
  | "lastName"
  | "gender"
  | "level"
  | "matchLevelMin"
  | "matchLevelMax"
  | "favoritePlayerRefs"
  | "preferredClubIds"
>;

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token?.trim();
  if (!token) throw data("Not Found", { status: 404 });
  const user = await findUserByManageToken(token);
  if (!user) throw data("Not Found", { status: 404 });

  const organizer: MatchOrganizer = {
    id: user.id,
    profileName: user.profileName,
    firstName: user.firstName,
    lastName: user.lastName,
    gender: user.gender,
    level: user.level,
    matchLevelMin: user.matchLevelMin,
    matchLevelMax: user.matchLevelMax,
    favoritePlayerRefs: user.favoritePlayerRefs,
    preferredClubIds: user.preferredClubIds,
  };

  return { token, organizer };
}

/** Child routes read the parent loader data via this hook. */
export function useMatchWizardData() {
  const value = useRouteLoaderData("routes/match.nieuw.$token") as
    | Awaited<ReturnType<typeof loader>>
    | undefined;
  if (!value) {
    throw new Error(
      "useMatchWizardData must be used within /match/nieuw/:token route tree.",
    );
  }
  return value;
}

export function meta() {
  return [
    { title: "PadelMatch | Nieuwe match" },
    {
      name: "description",
      content: "Plan een nieuwe padel-match en nodig spelers uit",
    },
  ];
}

/* ---------- Layout ---------- */

export default function MatchNieuwLayout({ loaderData }: Route.ComponentProps) {
  const { token, organizer } = loaderData;
  const location = useLocation();
  const currentSlug = currentStepFromPath(location.pathname);
  const displayName = formatPersonName({
    firstName: organizer.firstName,
    lastName: organizer.lastName,
    profileName: organizer.profileName,
    fallback: "speler",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PlayerAppHeader token={token} displayName={displayName}>
        {currentSlug !== null && (
          <div className="mx-auto max-w-3xl px-4 pb-3 pt-1 sm:px-6">
            <Stepper currentSlug={currentSlug} />
          </div>
        )}
      </PlayerAppHeader>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

/* ---------- Stepper ---------- */

function currentStepFromPath(pathname: string): MatchStepSlug | null {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  return MATCH_STEPS.some((s) => s.slug === last)
    ? (last as MatchStepSlug)
    : null;
}

function Stepper({ currentSlug }: { currentSlug: MatchStepSlug }) {
  const currentIndex = findMatchStepIndex(currentSlug);
  return (
    <ol className="grid grid-cols-6 gap-0.5" aria-label="Stappen match aanmaken">
      {MATCH_STEPS.map((step, i) => {
        const isActive = step.slug === currentSlug;
        const isDone = i < currentIndex;
        const state: StepState = isActive ? "active" : isDone ? "done" : "todo";
        return (
          <li key={step.slug}>
            <StepChip label={step.shortTitle} index={i + 1} state={state} />
          </li>
        );
      })}
    </ol>
  );
}

type StepState = "active" | "done" | "todo";

function StepChip({
  label,
  index,
  state,
}: {
  label: string;
  index: number;
  state: StepState;
}) {
  const base =
    "flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-center";
  const variant =
    state === "active"
      ? "border-accent bg-accent/15 text-foreground shadow-sm"
      : state === "done"
        ? "border-border bg-card text-foreground"
        : "border-border bg-card text-muted-foreground";

  return (
    <div
      aria-current={state === "active" ? "step" : undefined}
      className={`${base} ${variant}`}
    >
      <StepBadge state={state} index={index} />
      <span className="w-full truncate text-[10px] font-medium leading-tight">
        {label}
      </span>
    </div>
  );
}

function StepBadge({ state, index }: { state: StepState; index: number }) {
  if (state === "todo") {
    return (
      <span
        aria-hidden
        className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-muted-foreground"
      >
        {index}
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        aria-hidden
        className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 border-accent bg-background text-[10px] font-semibold text-accent-foreground"
      >
        {index}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent text-accent-foreground"
    >
      <CheckIcon className="h-3 w-3" strokeWidth={4} />
    </span>
  );
}

/* ---------- Icons ---------- */

function CheckIcon({
  className,
  strokeWidth = 3,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
