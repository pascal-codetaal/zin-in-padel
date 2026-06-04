import { useEffect, useState } from "react";
import { data, Link, redirect, useFetcher } from "react-router";
import {
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
  acceptedPlayerRefsOf,
  type Match,
  type MatchStatus,
  type PadelLevel,
} from "~/types/domain";
import { displayFriendName } from "~/lib/friend-name.server";
import { formatPersonName } from "~/lib/person-name";
import {
  addConfirmedSlotToMatch,
  cancelMatchAsOrganiser,
  removePlayerFromMatch,
  skipCascadePhase,
} from "~/lib/cascade/organiser.server";
import type { Route } from "./+types/match.$token";

type AcceptedRosterEntry = {
  playerRef: string;
  name: string;
};

type DeclineEntry = {
  playerRef: string;
  name: string;
};

type SkippedFriendEntry = {
  playerRef: string;
  name: string;
  reason: "not-registered" | "opted-out";
};

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
  acceptedRoster: AcceptedRosterEntry[];
  declines: DeclineEntry[];
  skippedFriends: SkippedFriendEntry[];
  openSlots: number;
  totalSlots: number;
  fallbackToLevelRange: boolean;
  fallbackLevelMin: PadelLevel | null;
  fallbackLevelMax: PadelLevel | null;
  fallbackLevelDelayMinutes: number;
  fallbackToEveryone: boolean;
  fallbackEveryoneDelayMinutes: number;
  currentCascadePhase: 0 | 1 | 2 | 3;
  nextCascadeAt: string | null;
  canSkipPhase: boolean;
};

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData
    ? formatPersonName({
        firstName: loaderData.firstName,
        lastName: loaderData.lastName,
        profileName: loaderData.profileName,
      })
    : undefined;
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
    new Set(matches.flatMap((m) => m.clubIds)),
  );

  const [clubs, db] = await Promise.all([getClubsByIds(clubIds), getDatabase()]);
  const clubsById = new Map(clubs.map((c) => [c.id, c]));
  const playersByRef = new Map(db.players.map((p) => [p.ref, p]));
  const usersByPhone = new Map(db.users.map((u) => [u.phone, u]));

  const cards: MatchCardData[] = matches.map((m) => {
    const matchClubs = m.clubIds
      .map((id) => clubsById.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    const acceptedRefs = acceptedPlayerRefsOf(m);
    const acceptedRoster: AcceptedRosterEntry[] = acceptedRefs.map((ref) => ({
      playerRef: ref,
      name: displayFriendName(user.favoriteNames, ref, playersByRef.get(ref), db.users, ref),
    }));
    const declines: DeclineEntry[] = m.invitedPlayers
      .filter((i) => i.status === "declined")
      .map((i) => ({
        playerRef: i.playerRef,
        name: displayFriendName(user.favoriteNames, i.playerRef, playersByRef.get(i.playerRef), db.users, i.playerRef),
      }));

    // Friends the organiser picked who never got an invite: either no User
    // record (not joined PadelMatch) or User exists but opted out. Cascade
    // silently skips them; surface to the organiser so they know.
    const skippedFriends: SkippedFriendEntry[] = m.invitedFriendRefs
      .map((ref): SkippedFriendEntry | null => {
        const u = usersByPhone.get(ref);
        if (!u) {
          return {
            playerRef: ref,
            name: displayFriendName(user.favoriteNames, ref, playersByRef.get(ref), db.users, ref),
            reason: "not-registered",
          };
        }
        if (!u.optedIn) {
          return {
            playerRef: ref,
            name: displayFriendName(user.favoriteNames, ref, playersByRef.get(ref), db.users, ref),
            reason: "opted-out",
          };
        }
        return null;
      })
      .filter((e): e is SkippedFriendEntry => e !== null);

    const hasFutureCascade =
      m.status === "open" &&
      openSlotsOf(m) > 0 &&
      ((m.currentCascadePhase < 2 && m.fallbackToLevelRange) ||
        (m.currentCascadePhase < 3 && m.fallbackToEveryone));

    return {
      id: m.id,
      scheduledAt: m.scheduledAt,
      durationMinutes: m.durationMinutes,
      format: m.format,
      status: m.status,
      clubName:
        matchClubs.length === 0
          ? "—"
          : matchClubs.map((c) => c.name).join(" · "),
      clubCity:
        matchClubs.length === 0
          ? ""
          : [...new Set(matchClubs.map((c) => c.city))].join(" · "),
      invitedNames: m.invitedFriendRefs.map((ref) =>
        displayFriendName(user.favoriteNames, ref, playersByRef.get(ref), db.users, ref),
      ),
      confirmedSlotNames: m.confirmedSlotNames,
      acceptedRoster,
      declines,
      skippedFriends,
      openSlots: openSlotsOf(m),
      totalSlots: m.totalSlots,
      fallbackToLevelRange: m.fallbackToLevelRange,
      fallbackLevelMin: m.fallbackLevelMin,
      fallbackLevelMax: m.fallbackLevelMax,
      fallbackLevelDelayMinutes: m.fallbackLevelDelayMinutes,
      fallbackToEveryone: m.fallbackToEveryone,
      fallbackEveryoneDelayMinutes: m.fallbackEveryoneDelayMinutes,
      currentCascadePhase: m.currentCascadePhase,
      nextCascadeAt: m.nextCascadeAt,
      canSkipPhase: hasFutureCascade,
    };
  });

  const url = new URL(request.url);
  const createdId = url.searchParams.get("created");

  return {
    token,
    profileName: user.profileName,
    firstName: user.firstName,
    lastName: user.lastName,
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
  const matchId = form.get("matchId")?.toString();
  if (!matchId) return { ok: false as const, error: "missing_match" };

  // Ownership check on every organiser action.
  const all = await findMatchesByOrganizer(user.id);
  if (!all.some((m) => m.id === matchId)) {
    return { ok: false as const, error: "forbidden" };
  }

  const now = new Date();

  if (intent === "cancel") {
    await cancelMatchAsOrganiser({ matchId, now });
    return redirect(`/match/${token}`);
  }

  if (intent === "skip-phase") {
    await skipCascadePhase({ matchId, now });
    return redirect(`/match/${token}`);
  }

  if (intent === "add-confirmed") {
    const name = form.get("name")?.toString() ?? "";
    await addConfirmedSlotToMatch({ matchId, name, now });
    return redirect(`/match/${token}`);
  }

  if (intent === "remove-player") {
    const playerRef = form.get("playerRef")?.toString();
    const confirmedSlotName = form.get("confirmedSlotName")?.toString();
    if (!playerRef && !confirmedSlotName) {
      return { ok: false as const, error: "missing_target" };
    }
    await removePlayerFromMatch({
      matchId,
      playerRef: playerRef || undefined,
      confirmedSlotName: confirmedSlotName || undefined,
      now,
    });
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
            Vrienden →
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
                token={token}
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
  token,
  highlight,
}: {
  match: MatchCardData;
  token: string;
  highlight: boolean;
}) {
  const cancelFetcher = useFetcher<typeof action>();
  const skipFetcher = useFetcher<typeof action>();
  const removeFetcher = useFetcher<typeof action>();
  const addFetcher = useFetcher<typeof action>();
  const cancelling = cancelFetcher.state !== "idle";
  const skipping = skipFetcher.state !== "idle";
  const removing = removeFetcher.state !== "idle";
  const adding = addFetcher.state !== "idle";

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
          value={
            <>
              {renderCascade(match)}
              {match.canSkipPhase && match.nextCascadeAt && (
                <div className="mt-1">
                  <CascadeCountdown targetIso={match.nextCascadeAt} />
                </div>
              )}
            </>
          }
          colSpan
        />
      </dl>

      {match.status !== "cancelled" && (
        <RosterPanel
          match={match}
          removeFetcher={removeFetcher}
          removing={removing}
          addFetcher={addFetcher}
          adding={adding}
        />
      )}

      {match.declines.length > 0 && match.status !== "cancelled" && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">
            {match.declines.length === 1
              ? `${match.declines[0]!.name} kan niet`
              : `${match.declines.length} spelers kunnen niet`}
          </span>
          {match.declines.length > 1 && (
            <span className="text-amber-700">
              {" "}
              · {match.declines.map((d) => d.name).join(", ")}
            </span>
          )}
        </div>
      )}

      {match.skippedFriends.length > 0 && match.status !== "cancelled" && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <div className="font-semibold text-slate-900">
            Geen uitnodiging verstuurd
          </div>
          <ul className="mt-1 space-y-0.5">
            {match.skippedFriends.map((s) => (
              <li key={s.playerRef}>
                {s.name} —{" "}
                {s.reason === "not-registered"
                  ? "niet ingeschreven bij PadelMatch"
                  : "heeft notificaties uitgezet"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        <Link
          to={`/match/${token}/${match.id}`}
          className="text-xs font-medium text-accent transition hover:text-accent-foreground"
        >
          Details →
        </Link>

        {match.status !== "cancelled" && (
          <>
            {match.canSkipPhase && (
              <skipFetcher.Form method="post">
                <input type="hidden" name="intent" value="skip-phase" />
                <input type="hidden" name="matchId" value={match.id} />
                <button
                  type="submit"
                  disabled={skipping}
                  onClick={(e) => {
                    if (!confirm("Volgende cascadefase nu starten?"))
                      e.preventDefault();
                  }}
                  className="text-xs font-medium text-accent transition hover:text-accent-foreground disabled:opacity-50"
                >
                  {skipping ? "Bezig…" : "Volgende fase nu →"}
                </button>
              </skipFetcher.Form>
            )}

            <cancelFetcher.Form method="post">
              <input type="hidden" name="intent" value="cancel" />
              <input type="hidden" name="matchId" value={match.id} />
              <button
                type="submit"
                disabled={cancelling}
                onClick={(e) => {
                  if (
                    !confirm(
                      "Match annuleren? Alle uitnodigingen worden ingetrokken.",
                    )
                  )
                    e.preventDefault();
                }}
                className="text-xs font-medium text-muted-foreground transition hover:text-destructive disabled:opacity-50"
              >
                {cancelling ? "Bezig…" : "Match annuleren"}
              </button>
            </cancelFetcher.Form>
          </>
        )}
      </div>
    </li>
  );
}

function RosterPanel({
  match,
  removeFetcher,
  removing,
  addFetcher,
  adding,
}: {
  match: MatchCardData;
  removeFetcher: ReturnType<typeof useFetcher<typeof action>>;
  removing: boolean;
  addFetcher: ReturnType<typeof useFetcher<typeof action>>;
  adding: boolean;
}) {
  const hasAnyone =
    match.confirmedSlotNames.length > 0 || match.acceptedRoster.length > 0;
  const canAdd = match.openSlots > 0;
  if (!hasAnyone && !canAdd) return null;

  return (
    <div className="mt-3 rounded-xl border border-border bg-secondary/30 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Op de baan
      </p>
      <ul className="mt-1 space-y-1">
        {match.confirmedSlotNames.map((name, idx) => (
          <li
            key={`confirmed-${idx}-${name}`}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span>{name}</span>
            <removeFetcher.Form method="post">
              <input type="hidden" name="intent" value="remove-player" />
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="confirmedSlotName" value={name} />
              <button
                type="submit"
                disabled={removing}
                onClick={(e) => {
                  if (!confirm(`${name} van de baan halen?`))
                    e.preventDefault();
                }}
                className="text-[10px] font-medium text-muted-foreground transition hover:text-destructive disabled:opacity-50"
              >
                verwijder
              </button>
            </removeFetcher.Form>
          </li>
        ))}
        {match.acceptedRoster.map((entry) => (
          <li
            key={`accepted-${entry.playerRef}`}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span>{entry.name}</span>
            <removeFetcher.Form method="post">
              <input type="hidden" name="intent" value="remove-player" />
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="playerRef" value={entry.playerRef} />
              <button
                type="submit"
                disabled={removing}
                onClick={(e) => {
                  if (
                    !confirm(
                      `${entry.name} van de baan halen? Ze krijgen een WhatsApp.`,
                    )
                  )
                    e.preventDefault();
                }}
                className="text-[10px] font-medium text-muted-foreground transition hover:text-destructive disabled:opacity-50"
              >
                verwijder
              </button>
            </removeFetcher.Form>
          </li>
        ))}
      </ul>

      {canAdd && (
        <addFetcher.Form
          method="post"
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            const form = e.currentTarget;
            // Clear input post-submit so the next name can be typed.
            setTimeout(() => {
              const input = form.querySelector<HTMLInputElement>(
                'input[name="name"]',
              );
              if (input) input.value = "";
            }, 0);
          }}
        >
          <input type="hidden" name="intent" value="add-confirmed" />
          <input type="hidden" name="matchId" value={match.id} />
          <input
            type="text"
            name="name"
            placeholder="Naam toevoegen (vriend/Playtomic)"
            className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs"
            disabled={adding}
            required
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-accent-foreground transition disabled:opacity-50"
          >
            {adding ? "…" : "+"}
          </button>
        </addFetcher.Form>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  colSpan = false,
}: {
  label: string;
  value: React.ReactNode;
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

function CascadeCountdown({ targetIso }: { targetIso: string }) {
  const target = new Date(targetIso).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = target - now;
  if (remaining <= 0) {
    return (
      <span className="text-xs text-amber-700">Volgende fase elk moment…</span>
    );
  }
  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = h > 0 ? `${h}u ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
  return (
    <span className="text-xs text-muted-foreground">
      Volgende fase over {label}
    </span>
  );
}

function renderCascade(match: MatchCardData): React.ReactNode {
  if (match.openSlots === 0) {
    return "Match vol — cascade gestopt";
  }
  const segments: { phase: 1 | 2 | 3; text: string }[] = [
    { phase: 1, text: "Vrienden (nu)" },
  ];
  if (match.fallbackToLevelRange) {
    const min = match.fallbackLevelMin
      ? formatPadelLevel(match.fallbackLevelMin)
      : "?";
    const max = match.fallbackLevelMax
      ? formatPadelLevel(match.fallbackLevelMax)
      : "?";
    segments.push({
      phase: 2,
      text: `P ${min}–${max} (+${match.fallbackLevelDelayMinutes} min)`,
    });
  }
  if (match.fallbackToEveryone) {
    segments.push({
      phase: 3,
      text: `Iedereen (+${match.fallbackEveryoneDelayMinutes} min)`,
    });
  }
  return (
    <>
      {segments.map((seg, i) => (
        <span key={seg.phase}>
          {i > 0 && " → "}
          {seg.phase === match.currentCascadePhase ? (
            <strong className="font-semibold">{seg.text}</strong>
          ) : (
            seg.text
          )}
        </span>
      ))}
    </>
  );
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
