import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { MatchPickerPlayer } from "~/lib/match-picker";
import {
  formatPadelLevelCompact,
  type PadelLevel,
} from "~/types/domain";

export type MatchInvitePickerProps = {
  players: MatchPickerPlayer[];
  /** Refs already on the court — not shown here. */
  onCourtRefs: string[];
  defaultInvitedRefs: string[];
  openSlots: number;
  maatjesHref: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0];
  if (parts.length === 1 && first) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

export function MatchInvitePicker({
  players,
  onCourtRefs,
  defaultInvitedRefs,
  openSlots,
  maatjesHref,
}: MatchInvitePickerProps) {
  const onCourt = useMemo(() => new Set(onCourtRefs), [onCourtRefs]);
  const invitePool = useMemo(
    () => players.filter((p) => !onCourt.has(p.ref)),
    [players, onCourt],
  );

  const initialInvited = useMemo(() => {
    const poolRefs = new Set(invitePool.map((p) => p.ref));
    return new Set(
      defaultInvitedRefs.filter((ref) => poolRefs.has(ref)),
    );
  }, [defaultInvitedRefs, invitePool]);

  const [invited, setInvited] = useState<Set<string>>(initialInvited);

  function toggle(ref: string) {
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  function selectAll() {
    setInvited(new Set(invitePool.map((p) => p.ref)));
  }

  function selectNone() {
    setInvited(new Set());
  }

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
          Nog geen maatjes.{" "}
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
          <div className="flex items-center justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="font-medium text-muted-foreground transition hover:text-foreground"
            >
              Allen uitnodigen
            </button>
            <span className="text-border">·</span>
            <button
              type="button"
              onClick={selectNone}
              className="font-medium text-muted-foreground transition hover:text-foreground"
            >
              Geen
            </button>
          </div>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {invitePool.map((player) => {
              const isOn = invited.has(player.ref);
              return (
                <li key={player.ref}>
                  <button
                    type="button"
                    onClick={() => toggle(player.ref)}
                    aria-pressed={isOn}
                    className={`flex w-full flex-col items-center gap-2 rounded-2xl border p-3 transition ${
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
                    {player.level !== null && (
                      <span className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tabular-nums text-accent-foreground">
                        {formatPadelLevelCompact(player.level)}
                      </span>
                    )}
                    {isOn && (
                      <span className="text-[10px] font-medium text-accent-foreground">
                        Uitnodigen
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {Array.from(invited).map((ref) => (
        <input
          key={ref}
          type="hidden"
          name="invitedFriendRefs"
          value={ref}
          readOnly
        />
      ))}
    </div>
  );
}
