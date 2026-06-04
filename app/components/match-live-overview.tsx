import type { ReactNode } from "react";
import { Form, Link, useNavigation } from "react-router";
import { formatScheduledAt } from "~/lib/match-defaults";
import {
  formatMatchFormat,
  formatPadelLevel,
  type MatchFormat,
  type MatchInviteStatus,
  type MatchStatus,
  type PadelLevel,
} from "~/types/domain";

export type LiveMatchPlayer = {
  id: string;
  name: string;
  source: "confirmed" | "accepted";
  playerRef?: string;
  confirmedSlotName?: string;
  isSelf?: boolean;
  level?: PadelLevel | null;
};

export type LiveMatchOverviewData = {
  id: string;
  scheduledAt: string | null;
  durationMinutes: number;
  format: MatchFormat;
  status: MatchStatus;
  totalSlots: number;
  openSlots: number;
  filledSlots: number;
  clubs: { id: string; name: string; city: string }[];
  players: LiveMatchPlayer[];
};

export type MatchLiveOverviewProps = {
  role: "organiser" | "participant";
  match: LiveMatchOverviewData;
  links: {
    backHref: string;
    backLabel: string;
    newMatchHref?: string;
  };
  participant?: {
    status: MatchInviteStatus;
    canLeave: boolean;
  };
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0];
  if (parts.length === 1 && first) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

export function MatchLiveOverview({
  role,
  match,
  links,
  participant,
}: MatchLiveOverviewProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const canOrganiserEdit = role === "organiser" && match.status !== "cancelled";
  const slotLabel =
    match.openSlots === 0
      ? `${match.totalSlots}/${match.totalSlots} spelers - volzet`
      : `${match.filledSlots}/${match.totalSlots} spelers - ${match.openSlots} open`;
  const locationLine =
    match.clubs.length === 0
      ? "Locatie nog niet gekend"
      : match.clubs.map((c) => `${c.name} - ${c.city}`).join(" / ");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to={links.backHref}
            className="flex items-center gap-2 font-display text-base font-bold"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground shadow-glow">
              <BallIcon className="h-3.5 w-3.5" />
            </span>
            Match
          </Link>
          <Link
            to={links.backHref}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            {links.backLabel}
          </Link>
        </div>
      </header>

      <main
        className={`mx-auto max-w-xl space-y-5 px-4 pt-6 sm:px-6 ${
          canOrganiserEdit ? "pb-32" : "pb-10"
        }`}
      >
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">
                {role === "organiser" ? "Jouw match" : "Je deelname"}
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold leading-tight">
                {formatScheduledAt(match.scheduledAt)}
              </h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {locationLine}
              </p>
            </div>
            <StatusBadge status={match.status} />
          </div>

          <div className="flex flex-wrap gap-2">
            <MetaPill>{formatMatchFormat(match.format)}</MetaPill>
            <MetaPill>{slotLabel}</MetaPill>
            <MetaPill>{match.durationMinutes} min</MetaPill>
          </div>
        </section>

        {participant && (
          <ParticipantNotice participant={participant} matchStatus={match.status} />
        )}

        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold leading-tight">Wie speelt mee?</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Huidige bezetting van de baan.
            </p>
          </div>

          <CourtCard
            match={match}
            canRemove={canOrganiserEdit}
            isSubmitting={isSubmitting}
          />
        </section>

        <section className="grid gap-2 sm:grid-cols-2">
          <InfoCard label="Locatie">
            {match.clubs.length === 0 ? (
              <span className="text-muted-foreground">Nog niet gekend</span>
            ) : (
              <span>
                {match.clubs.map((club) => `${club.name} - ${club.city}`).join(" / ")}
              </span>
            )}
          </InfoCard>
          <InfoCard label="Details">
            {formatMatchFormat(match.format)} · {match.durationMinutes} min ·{" "}
            {slotLabel}
          </InfoCard>
        </section>

        {role === "participant" && participant?.canLeave && (
          <Form method="post" className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <input type="hidden" name="intent" value="leave" />
            <p className="text-sm font-semibold">Kan je toch niet meedoen?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We halen je uit de match en sturen alleen de organisator een bericht.
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              onClick={(event) => {
                if (!confirm("Jezelf uit deze match halen?")) {
                  event.preventDefault();
                }
              }}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-destructive/30 bg-card px-5 text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
            >
              {isSubmitting ? "Bezig..." : "Ik kan toch niet meedoen"}
            </button>
          </Form>
        )}

      </main>

      {canOrganiserEdit && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
          <div className="border-t border-border/60 bg-background/85 backdrop-blur-md">
            <Form
              method="post"
              className="pointer-events-auto mx-auto max-w-xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:px-6"
            >
              <input type="hidden" name="intent" value="cancel" />
              <button
                type="submit"
                disabled={isSubmitting}
                onClick={(event) => {
                  if (
                    !confirm(
                      "Match annuleren? Alle actieve spelers en invitees krijgen een bericht.",
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-destructive px-5 text-sm font-semibold text-destructive-foreground shadow-soft transition hover:bg-destructive/90 disabled:opacity-50"
              >
                {isSubmitting ? "Annuleren..." : "Match annuleren"}
              </button>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}

export function CourtCard({
  match,
  canRemove,
  isSubmitting,
}: {
  match: LiveMatchOverviewData;
  canRemove: boolean;
  isSubmitting: boolean;
}) {
  const slots = [
    ...match.players.map((player) => ({ kind: "player" as const, player })),
    ...Array.from({ length: match.openSlots }, (_, index) => ({
      kind: "open" as const,
      index,
    })),
  ].slice(0, match.totalSlots);

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <div className="relative grid grid-cols-4 gap-2">
        {slots.map((slot, index) =>
          slot.kind === "player" ? (
            <CourtPlayerSlot
              key={slot.player.id}
              player={slot.player}
              canRemove={canRemove}
              isSubmitting={isSubmitting}
            />
          ) : (
            <CourtOpenSlot key={`open-${slot.index}`} slotNumber={index + 1} />
          ),
        )}
        <div
          className="absolute bottom-7 top-0 left-1/2 w-px -translate-x-1/2 bg-border"
          aria-hidden
        />
      </div>

      <div className="mt-2 flex justify-between px-1 text-2xl font-bold text-muted-foreground/50">
        <span>A</span>
        <span>B</span>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        {match.filledSlots}/{match.totalSlots} plekken ingevuld
      </p>
    </div>
  );
}

function CourtPlayerSlot({
  player,
  canRemove,
  isSubmitting,
}: {
  player: LiveMatchPlayer;
  canRemove: boolean;
  isSubmitting: boolean;
}) {
  const removable = canRemove && (player.playerRef || player.confirmedSlotName);

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <div className="relative">
        <span
          className={`inline-flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold ${
            player.isSelf
              ? "bg-accent text-accent-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {initials(player.name)}
        </span>
        {removable && (
          <Form method="post">
            <input type="hidden" name="intent" value="remove-player" />
            {player.playerRef && (
              <input type="hidden" name="playerRef" value={player.playerRef} />
            )}
            {player.confirmedSlotName && (
              <input
                type="hidden"
                name="confirmedSlotName"
                value={player.confirmedSlotName}
              />
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              aria-label={`${player.name} uit de match halen`}
              onClick={(event) => {
                if (!confirm(`${player.name} uit de match halen?`)) {
                  event.preventDefault();
                }
              }}
              className="absolute -right-0.5 -top-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-destructive text-destructive-foreground shadow-sm transition hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </Form>
        )}
      </div>
      <span className="w-full truncate text-center text-xs font-medium">
        {player.isSelf ? `${player.name} (jij)` : player.name}
      </span>
      {player.level !== null && player.level !== undefined && (
        <LevelBadge level={player.level} />
      )}
    </div>
  );
}

function CourtOpenSlot({ slotNumber }: { slotNumber: number }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary/50 bg-primary/5 text-xl font-medium text-primary">
        +
      </span>
      <span className="text-[10px] text-muted-foreground">Plek {slotNumber}</span>
    </div>
  );
}

function LevelBadge({ level }: { level: PadelLevel }) {
  return (
    <span className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tabular-nums text-accent-foreground">
      {formatPadelLevel(level)}
    </span>
  );
}

function XIcon({ className }: { className?: string }) {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ParticipantNotice({
  participant,
  matchStatus,
}: {
  participant: { status: MatchInviteStatus; canLeave: boolean };
  matchStatus: MatchStatus;
}) {
  if (matchStatus === "cancelled") {
    return (
      <p className="rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        Deze match werd geannuleerd.
      </p>
    );
  }
  if (participant.status === "accepted") {
    return (
      <p className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
        Je staat op de spelerslijst.
      </p>
    );
  }
  if (participant.status === "declined") {
    return (
      <p className="rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        Je staat niet meer op de spelerslijst.
      </p>
    );
  }
  if (participant.status === "expired") {
    return (
      <p className="rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        Deze uitnodiging is niet meer actief.
      </p>
    );
  }
  return (
    <p className="rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
      Je uitnodiging staat nog open.
    </p>
  );
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export function InfoCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium leading-snug">{children}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: MatchStatus }) {
  const style = (() => {
    switch (status) {
      case "open":
        return "bg-accent/15 text-accent-foreground border-accent/40";
      case "confirmed":
        return "bg-emerald-100 text-emerald-900 border-emerald-300";
      case "full":
        return "bg-blue-100 text-blue-900 border-blue-300";
      case "cancelled":
        return "bg-secondary text-muted-foreground border-border";
      default:
        return "bg-secondary text-secondary-foreground border-border";
    }
  })();
  const label = (() => {
    switch (status) {
      case "open":
        return "Open";
      case "confirmed":
        return "Bevestigd";
      case "full":
        return "Vol";
      case "cancelled":
        return "Geannuleerd";
      default:
        return status;
    }
  })();
  return (
    <span
      className={`inline-flex flex-none items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {label}
    </span>
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
