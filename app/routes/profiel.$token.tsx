import {
  data,
  Link,
  Outlet,
  useLocation,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/profiel.$token";
import { findUserByManageToken } from "~/lib/db.server";
import { isProfielStepComplete } from "~/lib/profiel-completion";
import { formatPersonName } from "~/lib/person-name";
import type {
  Gender,
  MatchPreference,
  PadelLevel,
  PreferredSide,
} from "~/types/domain";

/* ---------- Steps ---------- */

export type ProfielStepSlug =
  | "basis"
  | "kant"
  | "speelvoorkeur"
  | "clubs";

export const PROFIEL_STEPS: {
  slug: ProfielStepSlug;
  shortTitle: string;
}[] = [
  { slug: "basis", shortTitle: "Basis" },
  { slug: "kant", shortTitle: "Kant" },
  { slug: "speelvoorkeur", shortTitle: "Match" },
  { slug: "clubs", shortTitle: "Clubs" },
];

export function findStepIndex(slug: ProfielStepSlug): number {
  return PROFIEL_STEPS.findIndex((s) => s.slug === slug);
}

export function nextStepSlug(slug: ProfielStepSlug): ProfielStepSlug | null {
  const i = findStepIndex(slug);
  if (i < 0 || i >= PROFIEL_STEPS.length - 1) return null;
  return PROFIEL_STEPS[i + 1]!.slug;
}

export function prevStepSlug(slug: ProfielStepSlug): ProfielStepSlug | null {
  const i = findStepIndex(slug);
  if (i <= 0) return null;
  return PROFIEL_STEPS[i - 1]!.slug;
}

export function isStepComplete(
  slug: ProfielStepSlug,
  user: ProfielUser,
): boolean {
  return isProfielStepComplete(slug, user);
}

export function findFirstIncompleteStep(
  user: ProfielUser,
): ProfielStepSlug | null {
  for (const step of PROFIEL_STEPS) {
    if (!isStepComplete(step.slug, user)) return step.slug;
  }
  return null;
}

export function countCompletedSteps(user: ProfielUser): number {
  return PROFIEL_STEPS.filter((s) => isStepComplete(s.slug, user)).length;
}

/* ---------- Loader ---------- */

export type ProfielUser = {
  id: string;
  profileName: string;
  firstName: string | null;
  lastName: string | null;
  gender: Gender | null;
  level: PadelLevel | null;
  preferredSide: PreferredSide | null;
  playsBothSides: boolean;
  matchPreference: MatchPreference | null;
  matchLevelMin: PadelLevel | null;
  matchLevelMax: PadelLevel | null;
  preferredClubIds: string[];
};

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token?.trim();
  if (!token) throw data("Not Found", { status: 404 });
  const user = await findUserByManageToken(token);
  if (!user) throw data("Not Found", { status: 404 });
  return {
    token,
    user: {
      id: user.id,
      profileName: user.profileName,
      firstName: user.firstName,
      lastName: user.lastName,
      gender: user.gender,
      level: user.level,
      preferredSide: user.preferredSide,
      playsBothSides: user.playsBothSides,
      matchPreference: user.matchPreference,
      matchLevelMin: user.matchLevelMin,
      matchLevelMax: user.matchLevelMax,
      preferredClubIds: user.preferredClubIds,
    } satisfies ProfielUser,
  };
}

/**
 * Child routes read the parent layout's loader data via this hook,
 * so they don't have to re-query the user themselves.
 */
export function useProfielData() {
  const value = useRouteLoaderData("routes/profiel.$token") as
    | Awaited<ReturnType<typeof loader>>
    | undefined;
  if (!value) {
    throw new Error(
      "useProfielData must be used within /profiel/:token route tree.",
    );
  }
  return value;
}

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData
    ? formatPersonName({
        firstName: loaderData.user.firstName,
        lastName: loaderData.user.lastName,
        profileName: loaderData.user.profileName,
        fallback: "speler",
      })
    : undefined;
  return [
    {
      title: name
        ? `Profiel van ${name} — PadelMatch`
        : "Mijn profiel — PadelMatch",
    },
    {
      name: "description",
      content:
        "Stel je geslacht, padelklassement, speelvoorkeur en favoriete clubs in",
    },
  ];
}

/* ---------- Layout ---------- */

export default function ProfielLayout({ loaderData }: Route.ComponentProps) {
  const { token, user } = loaderData;
  const location = useLocation();
  const currentSlug = currentStepFromPath(location.pathname);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          <Link
            to={`/profiel/${token}`}
            className="flex items-center gap-2 font-display text-base font-bold"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground shadow-glow">
              <MessageIcon className="h-3.5 w-3.5" />
            </span>
            PadelMatch
          </Link>
          <Link
            to={`/maatjes/${token}`}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Vrienden →
          </Link>
        </div>
        {currentSlug !== null && (
          <div className="mx-auto max-w-3xl px-4 pb-3 pt-3 sm:px-6">
            <Stepper user={user} currentSlug={currentSlug} token={token} />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

/* ---------- Stepper ---------- */

function currentStepFromPath(pathname: string): ProfielStepSlug | null {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  return PROFIEL_STEPS.some((s) => s.slug === last)
    ? (last as ProfielStepSlug)
    : null;
}

function Stepper({
  user,
  currentSlug,
  token,
}: {
  user: ProfielUser;
  currentSlug: ProfielStepSlug;
  token: string;
}) {
  return (
    <ol className="grid grid-cols-4 gap-1">
      {PROFIEL_STEPS.map((step, i) => {
        const isActive = step.slug === currentSlug;
        const isDone = isStepComplete(step.slug, user);
        const state: StepState = isActive ? "active" : isDone ? "done" : "todo";
        return (
          <li key={step.slug}>
            <StepChip
              to={`/profiel/${token}/${step.slug}`}
              label={step.shortTitle}
              index={i + 1}
              state={state}
            />
          </li>
        );
      })}
    </ol>
  );
}

type StepState = "active" | "done" | "todo";

function StepChip({
  to,
  label,
  index,
  state,
}: {
  to: string;
  label: string;
  index: number;
  state: StepState;
}) {
  const base =
    "flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-center transition";
  const variant =
    state === "active"
      ? "border-accent bg-accent/15 text-foreground shadow-sm"
      : state === "done"
        ? "border-border bg-card text-foreground hover:bg-secondary/60"
        : "border-border bg-card text-muted-foreground hover:bg-secondary/60";

  return (
    <Link
      to={to}
      aria-current={state === "active" ? "step" : undefined}
      className={`${base} ${variant}`}
    >
      <StepBadge state={state} index={index} />
      <span className="text-[10px] font-medium leading-tight truncate w-full">
        {label}
      </span>
    </Link>
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

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}

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
