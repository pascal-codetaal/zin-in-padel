import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { GuestInviteActions } from "~/components/guest-invite-actions";
import { MatchNewPlayerButton } from "~/components/match-new-player-button";
import type { MatchPickerPlayer } from "~/lib/match-picker";
import { formatPadelLevelLabel } from "~/types/domain";

export type MatchInvitePickerProps = {
  players: MatchPickerPlayer[];
  /** Refs already on the court — not shown here. */
  onCourtRefs: string[];
  defaultInvitedRefs: string[];
  openSlots: number;
  maatjesHref: string;
  onInvitedChange?: (count: number) => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0];
  if (parts.length === 1 && first) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function sortInvitePool(pool: MatchPickerPlayer[]): MatchPickerPlayer[] {
  const invitable: MatchPickerPlayer[] = [];
  const guests: MatchPickerPlayer[] = [];
  for (const player of pool) {
    if (player.isAppUser) invitable.push(player);
    else guests.push(player);
  }
  return [...invitable, ...guests];
}

export function MatchInvitePicker({
  players,
  onCourtRefs,
  defaultInvitedRefs,
  openSlots,
  maatjesHref,
  onInvitedChange,
}: MatchInvitePickerProps) {
  const onCourt = useMemo(() => new Set(onCourtRefs), [onCourtRefs]);
  const invitePool = useMemo(
    () => players.filter((p) => !onCourt.has(p.ref)),
    [players, onCourt],
  );
  const sortedInvitePool = useMemo(
    () => sortInvitePool(invitePool),
    [invitePool],
  );
  const invitableRefs = useMemo(
    () => new Set(invitePool.filter((p) => p.isAppUser).map((p) => p.ref)),
    [invitePool],
  );
  const invitablePlayers = useMemo(
    () => invitePool.filter((p) => p.isAppUser),
    [invitePool],
  );

  const invitedFromLoader = useMemo(() => {
    return new Set(
      defaultInvitedRefs.filter((ref) => invitableRefs.has(ref)),
    );
  }, [defaultInvitedRefs, invitableRefs]);

  const [invited, setInvited] = useState(invitedFromLoader);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  useEffect(() => {
    setInvited(invitedFromLoader);
  }, [invitedFromLoader]);

  async function copyInvite(text: string, ref: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRef(ref);
      window.setTimeout(() => setCopiedRef(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  useEffect(() => {
    const count = [...invited].filter((ref) => invitableRefs.has(ref)).length;
    onInvitedChange?.(count);
  }, [invited, invitableRefs, onInvitedChange]);

  function toggle(ref: string) {
    if (!invitableRefs.has(ref)) return;
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  function selectAll() {
    setInvited(new Set(invitablePlayers.map((p) => p.ref)));
  }

  function selectNone() {
    setInvited(new Set());
  }

  const allSelected =
    invitablePlayers.length > 0 &&
    invitablePlayers.every((p) => invited.has(p.ref));
  const manualSelected = !allSelected;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {openSlots === 0
          ? "De baan is vol — je hoeft niemand meer uit te nodigen."
          : openSlots === 1
            ? "Er is nog 1 plek vrij. Kies wie je wilt vragen."
            : `Er zijn nog ${openSlots} plekken vrij. Kies wie je wilt vragen.`}
      </p>

      {players.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Nog geen vrienden.{" "}
          <Link to={maatjesHref} className="font-medium text-foreground underline">
            Voeg er eerst toe →
          </Link>
        </p>
      ) : invitePool.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-4 text-center text-sm text-muted-foreground">
          Iedereen staat al op de baan.
        </p>
      ) : openSlots === 0 ? null : (
        <>
          {invitablePlayers.length > 0 && (
            <div
              role="group"
              aria-label="Alle vrienden selecteren of zelf kiezen"
              className="grid grid-cols-2 gap-1 rounded-full border border-border bg-secondary/50 p-1"
            >
              <button
                type="button"
                onClick={selectAll}
                aria-pressed={allSelected}
                className={`inline-flex h-10 items-center justify-center rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  allSelected
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                }`}
              >
                Alle vrienden selecteren
              </button>
              <button
                type="button"
                onClick={selectNone}
                aria-pressed={manualSelected}
                className={`inline-flex h-10 items-center justify-center rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  manualSelected
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                }`}
              >
                Ik kies zelf
              </button>
            </div>
          )}

          <ul className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3">
            {sortedInvitePool.map((player) => {
              const isInvitable = player.isAppUser;
              const isOn = invited.has(player.ref);

              if (!isInvitable) {
                return (
                  <li key={player.ref} className="h-full min-h-0">
                    <div
                      aria-disabled="true"
                      className="relative flex h-full w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 p-3"
                    >
                      <div className="relative w-full">
                        <div className="flex justify-center opacity-50">
                          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                            {initials(player.name)}
                          </span>
                        </div>
                        <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2">
                          <GuestInviteActions
                            inviteUrl={player.inviteUrl}
                            inviteForwardText={player.inviteForwardText}
                            playerRef={player.ref}
                            copiedRef={copiedRef}
                            onCopy={copyInvite}
                            layout="row"
                          />
                        </div>
                      </div>
                      <span className="w-full truncate text-center text-sm font-medium text-muted-foreground opacity-50">
                        {player.name}
                      </span>
                      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground opacity-50">
                        {formatPadelLevelLabel(player.level, false)}
                      </span>
                      <span className="flex h-[14px] items-center text-[10px] font-medium text-muted-foreground opacity-50">
                        Nog geen gebruiker
                      </span>
                    </div>
                  </li>
                );
              }

              return (
                <li key={player.ref} className="h-full min-h-0">
                  <button
                    type="button"
                    onClick={() => toggle(player.ref)}
                    aria-pressed={isOn}
                    className={`flex h-full w-full flex-col items-center gap-2 rounded-2xl border p-3 transition ${
                      isOn
                        ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                        : "border-border bg-card hover:bg-secondary/40"
                    }`}
                  >
                    <span
                      className={`inline-flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold ${
                        isOn
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {initials(player.name)}
                    </span>
                    <span className="w-full truncate text-center text-sm font-medium">
                      {player.name}
                    </span>
                    <span className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tabular-nums text-accent-foreground">
                      {formatPadelLevelLabel(player.level, true)}
                    </span>
                    <span
                      className={`flex h-[14px] items-center text-[10px] font-medium ${
                        isOn
                          ? "text-accent-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {isOn ? "Uitnodigen" : "Niet uitnodigen"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {[...invited]
        .filter((ref) => invitableRefs.has(ref))
        .map((ref) => (
          <input
            key={ref}
            type="hidden"
            name="invitedFriendRefs"
            value={ref}
            readOnly
          />
        ))}

      <MatchNewPlayerButton href={maatjesHref} />
    </div>
  );
}
