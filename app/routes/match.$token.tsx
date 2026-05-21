import { data, Form, Link, redirect, useFetcher } from "react-router";
import {
  cancelMatch,
  findMatchesByOrganizer,
  findUserByManageToken,
  getDatabase,
} from "~/lib/db.server";
import { getClubsByIds } from "~/lib/clubs.server";
import { formatScheduledAt } from "~/lib/match-defaults";
import {
  formatMatchFormat,
  formatPadelLevel,
  openSlotsOf,
  type Match,
  type MatchStatus,
  type PadelLevel,
} from "~/types/domain";
import type { Route } from "./+types/match.$token";

type MatchCardData = {
  id: string;
  scheduledAt: string | null;
  durationMinutes: number;
  format: Match["format"];
  status: MatchStatus;
  clubName: string;
  clubCity: string;
  invitedNames: string[];
  confirmedSlotNames: string[];
  openSlots: number;
  totalSlots: number;
  fallbackToLevelRange: boolean;
  fallbackLevelMin: PadelLevel | null;
  fallbackLevelMax: PadelLevel | null;
  fallbackLevelDelayMinutes: number;
  fallbackToEveryone: boolean;
  fallbackEveryoneDelayMinutes: number;
};

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData?.profileName;
  return [
    {
      title: name
        ? `Matches van ${name} — PadelMatch`
        : "Mijn matches — PadelMatch",
    },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = params.token?.trim();
  if (!token) throw data("Not Found", { status: 404 });
  const user = await findUserByManageToken(token);
  if (!user) throw data("Not Found", { status: 404 });

  const matches = await findMatchesByOrganizer(user.id);
  const clubIds = Array.from(
    new Set(matches.map((m) => m.clubId).filter((c): c is string => !!c)),
  );
  const friendRefs = Array.from(
    new Set(matches.flatMap((m) => m.invitedFriendRefs)),
  );

  const [clubs, db] = await Promise.all([getClubsByIds(clubIds), getDatabase()]);
  const clubsById = new Map(clubs.map((c) => [c.id, c]));
  const playersByRef = new Map(db.players.map((p) => [p.ref, p]));

  const cards: MatchCardData[] = matches.map((m) => {
    const club = m.clubId ? clubsById.get(m.clubId) : undefined;
    return {
      id: m.id,
      scheduledAt: m.scheduledAt,
      durationMinutes: m.durationMinutes,
      format: m.format,
      status: m.status,
      clubName: club?.name ?? "—",
      clubCity: club?.city ?? "",
      invitedNames: m.invitedFriendRefs.map(
        (ref) => playersByRef.get(ref)?.name ?? ref,
      ),
      confirmedSlotNames: m.confirmedSlotNames,
      openSlots: openSlotsOf(m),
      totalSlots: m.totalSlots,
      fallbackToLevelRange: m.fallbackToLevelRange,
      fallbackLevelMin: m.fallbackLevelMin,
      fallbackLevelMax: m.fallbackLevelMax,
      fallbackLevelDelayMinutes: m.fallbackLevelDelayMinutes,
      fallbackToEveryone: m.fallbackToEveryone,
      fallbackEveryoneDelayMinutes: m.fallbackEveryoneDelayMinutes,
    };
  });

  const url = new URL(request.url);
  const createdId = url.searchParams.get("created");

  return {
    token,
    profileName: user.profileName,
    matches: cards,
    createdId,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token) return { ok: false as const, error: "missing_token" };
  const user = await findUserByManageToken(token);
  if (!user) return { ok: false as const, error: "user_not_found" };

  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  if (intent === "cancel") {
    const matchId = form.get("matchId")?.toString();
    if (!matchId) return { ok: false as const, error: "missing_match" };
    const all = await findMatchesByOrganizer(user.id);
    if (!all.some((m) => m.id === matchId)) {
      return { ok: false as const, error: "forbidden" };
    }
    await cancelMatch(matchId);
    return redirect(`/match/${token}`);
  }

  return { ok: false as const, error: "unknown_intent" };
}

export default function MatchesList({ loaderData }: Route.ComponentProps) {
  const { token, matches, createdId } = loaderData;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to={`/maatjes/${token}`}
            className="flex items-center gap-2 font-display text-base font-bold"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground shadow-glow">
              <BallIcon className="h-3.5 w-3.5" />
            </span>
            Mijn matches
          </Link>
          <Link
            to={`/maatjes/${token}`}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Maatjes →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6">
        {createdId && (
          <p className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
            Je match is aangemaakt 🎾
          </p>
        )}

        {matches.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {matches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                highlight={m.id === createdId}
              />
            ))}
          </ul>
        )}
      </main>

      <FixedNewMatchFooter token={token} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-secondary/30 px-6 py-12 text-center">
      <p className="text-base font-medium">Nog geen matches</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Plan je eerste potje met de knop hieronder.
      </p>
    </div>
  );
}

function MatchCard({
  match,
  highlight,
}: {
  match: MatchCardData;
  highlight: boolean;
}) {
  const cancelFetcher = useFetcher<typeof action>();
  const cancelling = cancelFetcher.state !== "idle";

  return (
    <li
      className={`rounded-2xl border bg-card p-4 shadow-soft ${
        highlight ? "border-accent/60 ring-2 ring-accent/30" : "border-border"
      } ${match.status === "cancelled" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">
            {formatScheduledAt(match.scheduledAt)}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {match.clubName}
            {match.clubCity ? ` · ${match.clubCity}` : ""}
            {" · "}
            {match.durationMinutes} min
          </p>
        </div>
        <StatusBadge status={match.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Detail label="Formaat" value={formatMatchFormat(match.format)} />
        <Detail
          label="Spelers"
          value={
            match.openSlots === 0
              ? `${match.totalSlots}/${match.totalSlots} (volzet)`
              : `${match.totalSlots - match.openSlots}/${match.totalSlots} · ${match.openSlots} open`
          }
        />
        <Detail
          label="Bevestigd"
          value={
            match.confirmedSlotNames.length === 0
              ? "—"
              : match.confirmedSlotNames.join(", ")
          }
          colSpan
        />
        <Detail
          label="Uitgenodigd"
          value={
            match.invitedNames.length === 0
              ? "—"
              : `${match.invitedNames.length}: ${match.invitedNames.slice(0, 3).join(", ")}${match.invitedNames.length > 3 ? "…" : ""}`
          }
          colSpan
        />
        <Detail
          label="Cascade"
          value={renderCascade(match)}
          colSpan
        />
      </dl>

      {match.status !== "cancelled" && (
        <cancelFetcher.Form method="post" className="mt-3 text-right">
          <input type="hidden" name="intent" value="cancel" />
          <input type="hidden" name="matchId" value={match.id} />
          <button
            type="submit"
            disabled={cancelling}
            onClick={(e) => {
              if (!confirm("Match annuleren?")) e.preventDefault();
            }}
            className="text-xs font-medium text-muted-foreground transition hover:text-destructive disabled:opacity-50"
          >
            {cancelling ? "Bezig…" : "Match annuleren"}
          </button>
        </cancelFetcher.Form>
      )}
    </li>
  );
}

function Detail({
  label,
  value,
  colSpan = false,
}: {
  label: string;
  value: string;
  colSpan?: boolean;
}) {
  return (
    <div className={colSpan ? "col-span-2" : undefined}>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
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

function renderCascade(match: MatchCardData): string {
  const parts: string[] = ["Maatjes (nu)"];
  if (match.fallbackToLevelRange) {
    const min = match.fallbackLevelMin
      ? formatPadelLevel(match.fallbackLevelMin)
      : "?";
    const max = match.fallbackLevelMax
      ? formatPadelLevel(match.fallbackLevelMax)
      : "?";
    parts.push(
      `P ${min}–${max} (+${match.fallbackLevelDelayMinutes} min)`,
    );
  }
  if (match.fallbackToEveryone) {
    parts.push(`Iedereen (+${match.fallbackEveryoneDelayMinutes} min)`);
  }
  return parts.join(" → ");
}

function FixedNewMatchFooter({ token }: { token: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="border-t border-border/60 bg-background/85 backdrop-blur-md">
        <div className="pointer-events-auto mx-auto max-w-3xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:px-6">
          <Link
            to={`/match/nieuw/${token}`}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-glow transition hover:bg-accent/90"
          >
            Nieuwe match plannen →
          </Link>
        </div>
      </div>
    </div>
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
