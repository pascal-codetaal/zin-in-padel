import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";

export type PlayerAppNavSection =
  | "matchen"
  | "vrienden"
  | "nieuwe-match"
  | "profiel";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0];
  if (parts.length === 1 && first) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function activeSection(pathname: string, token: string): PlayerAppNavSection | null {
  if (pathname.startsWith(`/profiel/${token}`)) return "profiel";
  if (pathname.startsWith(`/maatjes/${token}`)) return "vrienden";
  if (pathname.startsWith(`/match/nieuw/${token}`)) return "nieuwe-match";
  if (
    pathname === `/match/${token}` ||
    (pathname.startsWith(`/match/${token}/`) &&
      !pathname.startsWith(`/match/nieuw/`))
  ) {
    return "matchen";
  }
  return null;
}

function navLinkClass(active: PlayerAppNavSection | null, section: PlayerAppNavSection) {
  return active === section
    ? "text-xs font-semibold text-foreground sm:text-sm"
    : "text-xs font-medium text-muted-foreground transition hover:text-foreground sm:text-sm";
}

export function PlayerAppHeader({
  token,
  displayName,
  children,
}: {
  token: string;
  displayName: string;
  children?: ReactNode;
}) {
  const { pathname } = useLocation();
  const active = activeSection(pathname, token);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
        <Link
          to={`/match/${token}`}
          className="flex shrink-0 items-center gap-2 font-display text-base font-bold"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground shadow-glow">
            <BallIcon className="h-3.5 w-3.5" />
          </span>
          <span className="hidden sm:inline">PadelMatch</span>
        </Link>

        <nav
          className="flex min-w-0 items-center gap-2 sm:gap-3"
          aria-label="Hoofdnavigatie"
        >
          <Link to={`/match/${token}`} className={navLinkClass(active, "matchen")}>
            Matchen
          </Link>
          <Link to={`/maatjes/${token}`} className={navLinkClass(active, "vrienden")}>
            Vrienden
          </Link>
          <Link
            to={`/match/nieuw/${token}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground shadow-glow transition hover:bg-accent/90 sm:gap-1.5 sm:px-3 sm:text-sm"
            aria-label="Match aanmaken"
          >
            <PlusIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Match</span>
          </Link>
          <Link
            to={`/profiel/${token}`}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Profiel"
            title="Profiel"
          >
            <span
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold sm:h-9 sm:w-9 sm:text-sm ${
                active === "profiel"
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {initials(displayName)}
            </span>
          </Link>
        </nav>
      </div>
      {children}
    </header>
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
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BallIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M5.4 6.2C8.6 8.6 8.6 15.4 5.4 17.8" />
      <path d="M18.6 6.2c-3.2 2.4-3.2 9.2 0 11.6" />
    </svg>
  );
}
