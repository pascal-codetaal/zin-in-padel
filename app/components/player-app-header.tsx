import { useEffect, useState, type ReactNode } from "react";
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
    ? "font-semibold text-foreground"
    : "font-medium text-muted-foreground transition hover:text-foreground";
}

function navIconBadgeClass(active: boolean) {
  return active
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-muted-foreground";
}

const SECTION_LABELS: Record<PlayerAppNavSection, string> = {
  matchen: "Matchen",
  vrienden: "Vrienden",
  "nieuwe-match": "Nieuwe match",
  profiel: "Profiel",
};

export function PlayerAppHeader({
  token,
  displayName,
  centerLabel,
  children,
}: {
  token: string;
  displayName: string;
  /** Overschrijft de standaard sectietitel (bv. wizard-stap). */
  centerLabel?: string;
  children?: ReactNode;
}) {
  const { pathname } = useLocation();
  const active = activeSection(pathname, token);
  const headerTitle = centerLabel ?? (active ? SECTION_LABELS[active] : null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="relative mx-auto grid h-14 max-w-3xl grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link
          to={`/match/${token}`}
          className="flex shrink-0 items-center gap-2 font-display text-base font-bold"
          onClick={closeMenu}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground shadow-glow">
            <BallIcon className="h-3.5 w-3.5" />
          </span>
          <span className="hidden sm:inline">PadelMatch</span>
        </Link>

        {headerTitle ? (
          <p
            className="pointer-events-none min-w-0 truncate px-1 text-center text-sm font-semibold text-foreground md:hidden"
            aria-current="page"
          >
            {headerTitle}
          </p>
        ) : (
          <span aria-hidden className="min-w-0 md:hidden" />
        )}

        <div className="flex items-center justify-end gap-2 md:gap-3">
          <nav
            className="hidden min-w-0 items-center gap-2 md:flex md:gap-3"
            aria-label="Hoofdnavigatie"
          >
            <PlayerNavLinks
              token={token}
              displayName={displayName}
              active={active}
              variant="desktop"
            />
          </nav>

          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground transition hover:bg-secondary/80 md:hidden"
            aria-expanded={menuOpen}
            aria-controls="player-app-mobile-menu"
            aria-label={menuOpen ? "Menu sluiten" : "Menu openen"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <CloseIcon className="h-5 w-5" />
            ) : (
              <MenuIcon className="h-5 w-5" />
            )}
          </button>
        </div>

        {menuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-x-0 top-14 bottom-0 z-40 bg-foreground/20 md:hidden"
              aria-label="Menu sluiten"
              onClick={closeMenu}
            />
            <nav
              id="player-app-mobile-menu"
              className="absolute inset-x-0 top-full z-50 border-b border-border/60 bg-background px-4 py-3 shadow-lg md:hidden"
              aria-label="Hoofdnavigatie"
            >
              <PlayerNavLinks
                token={token}
                displayName={displayName}
                active={active}
                variant="mobile"
                onNavigate={closeMenu}
              />
            </nav>
          </>
        )}
      </div>
      {children}
    </header>
  );
}

function PlayerNavLinks({
  token,
  displayName,
  active,
  variant,
  onNavigate,
}: {
  token: string;
  displayName: string;
  active: PlayerAppNavSection | null;
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const isMobile = variant === "mobile";
  const textSize = isMobile ? "text-base" : "text-xs sm:text-sm";

  if (isMobile) {
    return (
      <ul className="flex flex-col gap-1">
        <li>
          <Link
            to={`/profiel/${token}`}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 ${textSize} ${navLinkClass(active, "profiel")}`}
            onClick={onNavigate}
          >
            <span
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${navIconBadgeClass(active === "profiel")} ${
                active === "profiel" ? "ring-2 ring-primary/30" : ""
              }`}
            >
              {initials(displayName)}
            </span>
            Profiel
          </Link>
        </li>
        <li>
          <MobileNavItem
            to={`/match/${token}`}
            label="Matchen"
            active={active === "matchen"}
            textSize={textSize}
            onNavigate={onNavigate}
            icon={
              <BallIcon className="h-4 w-4" aria-hidden />
            }
          />
        </li>
        <li>
          <MobileNavItem
            to={`/maatjes/${token}`}
            label="Vrienden"
            active={active === "vrienden"}
            textSize={textSize}
            onNavigate={onNavigate}
            icon={
              <UsersIcon className="h-4 w-4" aria-hidden />
            }
          />
        </li>
        <li>
          <Link
            to={`/match/nieuw/${token}`}
            className="mt-1 flex items-center gap-3 rounded-full bg-accent px-3 py-3 text-base font-semibold text-accent-foreground shadow-glow transition hover:bg-accent/90"
            aria-label="Match aanmaken"
            onClick={onNavigate}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-foreground/15">
              <PlusIcon className="h-4 w-4" />
            </span>
            Match
          </Link>
        </li>
      </ul>
    );
  }

  return (
    <>
      <Link
        to={`/match/${token}`}
        className={`${textSize} ${navLinkClass(active, "matchen")}`}
      >
        Matchen
      </Link>
      <Link
        to={`/maatjes/${token}`}
        className={`${textSize} ${navLinkClass(active, "vrienden")}`}
      >
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
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold sm:h-9 sm:w-9 sm:text-sm ${navIconBadgeClass(active === "profiel")} ${
            active === "profiel" ? "ring-2 ring-primary/30" : ""
          }`}
        >
          {initials(displayName)}
        </span>
      </Link>
    </>
  );
}

function MobileNavItem({
  to,
  label,
  active,
  textSize,
  icon,
  onNavigate,
}: {
  to: string;
  label: string;
  active: boolean;
  textSize: string;
  icon: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 ${textSize} ${
        active
          ? "font-semibold text-foreground"
          : "font-medium text-muted-foreground transition hover:text-foreground"
      }`}
      onClick={onNavigate}
    >
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${navIconBadgeClass(active)}`}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
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
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
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
