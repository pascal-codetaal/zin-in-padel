import { Link } from "react-router";
import {
  countCompletedSteps,
  findFirstIncompleteStep,
  PROFIEL_STEPS,
  useProfielData,
} from "./profiel.$token";
import { formatPersonName } from "~/lib/person-name";

const STEP_BULLETS: Record<
  (typeof PROFIEL_STEPS)[number]["slug"],
  { title: string; sub: string }
> = {
  basis: { title: "Over jou", sub: "Naam, man/vrouw en niveau" },
  kant: { title: "Kant", sub: "Links of rechts, eventueel beide" },
  speelvoorkeur: { title: "Voorkeur", sub: "Met wie je wil spelen" },
  clubs: { title: "Clubs", sub: "Waar je beschikbaar bent" },
};

export default function ProfielWelcome() {
  const { token, user } = useProfielData();
  const completed = countCompletedSteps(user);
  const firstIncomplete = findFirstIncompleteStep(user);
  const startSlug = firstIncomplete ?? PROFIEL_STEPS[0]!.slug;
  const displayName = formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: "speler",
  });

  const ctaLabel =
    completed === 0
      ? "Start →"
      : completed === PROFIEL_STEPS.length
        ? "Profiel bewerken →"
        : "Verdergaan →";

  return (
    <>
      <section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Welkom
          </p>
          <h1 className="mt-1 text-3xl font-bold leading-tight">
            Hoi {displayName} 👋
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Vier korte vragen, dan vinden we vrienden die bij je passen.
          </p>
        </div>

        <ul className="space-y-2">
          {PROFIEL_STEPS.map((step, i) => {
            const bullet = STEP_BULLETS[step.slug];
            return (
              <li
                key={step.slug}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-medium">
                    {bullet.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {bullet.sub}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {completed > 0 && completed < PROFIEL_STEPS.length && (
          <p className="text-xs text-muted-foreground">
            {completed} van {PROFIEL_STEPS.length} stappen ingevuld.
          </p>
        )}

        {completed === PROFIEL_STEPS.length && (
          <Link
            to={`/match/nieuw/${token}`}
            className="flex items-center justify-between rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3"
          >
            <span>
              <span className="block text-sm font-medium">Klaar om te spelen?</span>
              <span className="block text-xs text-muted-foreground">
                Plan een nieuwe match en nodig je vrienden uit.
              </span>
            </span>
            <span className="text-xl">→</span>
          </Link>
        )}
      </section>

      <FixedStartButton to={`/profiel/${token}/${startSlug}`} label={ctaLabel} />
    </>
  );
}

function FixedStartButton({ to, label }: { to: string; label: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="border-t border-border/60 bg-background/85 backdrop-blur-md">
        <div className="pointer-events-auto mx-auto max-w-3xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:px-6">
          <Link
            to={to}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-glow transition hover:bg-accent/90"
          >
            {label}
          </Link>
        </div>
      </div>
    </div>
  );
}
