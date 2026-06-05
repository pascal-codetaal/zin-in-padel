import { useEffect, useMemo, useState } from "react";
import {
  isMaatjeCourtFull,
  MAATJE_SLOT_COUNT,
  type MaatjeSlots,
  type MatchPickerPlayer,
} from "~/lib/match-picker";
import { Link } from "react-router";
import { MatchNewPlayerButton } from "~/components/match-new-player-button";
import {
  formatPadelLevelLabel,
  type PadelLevel,
} from "~/types/domain";

export type MatchCourtPickerProps = {
  organizerName: string;
  organizerLevel: PadelLevel | null;
  players: MatchPickerPlayer[];
  defaultSlots: MaatjeSlots;
  maatjesHref: string;
  onCourtStateChange?: (state: {
    filledCount: number;
    courtFull: boolean;
  }) => void;
};

function firstEmptySlotIndex(slots: MaatjeSlots): number | null {
  const idx = slots.findIndex((ref) => ref === null);
  return idx === -1 ? null : idx;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0];
  if (parts.length === 1 && first) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

export function MatchCourtPicker({
  organizerName,
  organizerLevel,
  players,
  defaultSlots,
  maatjesHref,
  onCourtStateChange,
}: MatchCourtPickerProps) {
  const validRefs = useMemo(
    () => new Set(players.map((p) => p.ref)),
    [players],
  );

  const initialSlots = useMemo((): MaatjeSlots => {
    return defaultSlots.map((ref) =>
      ref && validRefs.has(ref) ? ref : null,
    ) as MaatjeSlots;
  }, [defaultSlots, validRefs]);

  const [slots, setSlots] = useState<MaatjeSlots>(initialSlots);
  const [activeSlot, setActiveSlot] = useState<number | null>(() => {
    const firstEmpty = initialSlots.findIndex((ref) => ref === null);
    return firstEmpty === -1 ? null : firstEmpty;
  });

  const playerByRef = useMemo(
    () => new Map(players.map((p) => [p.ref, p])),
    [players],
  );

  const filledCount = slots.filter(Boolean).length + 1;
  const courtFull = isMaatjeCourtFull(slots);

  useEffect(() => {
    onCourtStateChange?.({ filledCount, courtFull });
  }, [filledCount, courtFull, onCourtStateChange]);

  useEffect(() => {
    if (courtFull) setActiveSlot(null);
  }, [courtFull]);

  function assignPlayer(ref: string) {
    if (activeSlot === null) return;
    const next: MaatjeSlots = [...slots];
    for (let i = 0; i < MAATJE_SLOT_COUNT; i++) {
      if (next[i] === ref) next[i] = null;
    }
    next[activeSlot] = ref;
    setSlots(next);
    setActiveSlot(firstEmptySlotIndex(next));
  }

  function clearSlot(index: number) {
    const next: MaatjeSlots = [...slots];
    next[index] = null;
    setSlots(next);
    setActiveSlot(index);
  }

  const availableForPick =
    activeSlot !== null
      ? players.filter(
          (p) =>
            !slots.some((s, i) => s === p.ref && i !== activeSlot),
        )
      : [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="relative grid grid-cols-4 gap-2">
          <CourtSlotDisplay
            name={organizerName || "Jij"}
            level={organizerLevel}
            fixed
          />
          {[0, 1, 2].map((slotIndex) => {
            const ref = slots[slotIndex];
            const player = ref ? playerByRef.get(ref) : undefined;
            const isActive = activeSlot === slotIndex;
            return (
              <CourtSlotButton
                key={slotIndex}
                slotIndex={slotIndex}
                name={player?.name}
                level={player?.level ?? null}
                isAppUser={player?.isAppUser ?? false}
                isActive={isActive}
                onSelect={() => setActiveSlot(slotIndex)}
                onClear={() => clearSlot(slotIndex)}
              />
            );
          })}
          <div
            className="absolute bottom-6 top-0 left-1/2 w-px -translate-x-1/2 bg-border"
            aria-hidden
          />
        </div>

        <div className="mt-2 flex justify-between px-1 text-2xl font-bold text-muted-foreground/50">
          <span>A</span>
          <span>B</span>
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {filledCount}/4 plekken ingevuld
        </p>
      </div>

      {activeSlot !== null ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Kies wie op plek {activeSlot + 2} speelt
          </p>
          {availableForPick.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-4 text-center text-sm text-muted-foreground">
              Geen vrienden beschikbaar.{" "}
              <Link to={maatjesHref} className="font-medium underline">
                Voeg toe →
              </Link>
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {availableForPick.map((player) => (
                <li key={player.ref}>
                  <button
                    type="button"
                    onClick={() => assignPlayer(player.ref)}
                    className="flex w-full flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 transition hover:border-primary hover:bg-primary/5"
                  >
                    <PlayerAvatar name={player.name} variant="confirmed" />
                    <span className="w-full truncate text-center text-sm font-medium">
                      {player.name}
                    </span>
                    <LevelBadge
                      level={player.level}
                      isAppUser={player.isAppUser}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : courtFull ? (
        <p className="rounded-2xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
          De baan is vol — je hoeft niemand meer uit te nodigen. Haal een speler
          van de baan om verder te gaan.
        </p>
      ) : null}

      {slots.map((ref, i) => (
        <input
          key={`slot-${i}`}
          type="hidden"
          name={`confirmedSlot_${i + 1}`}
          value={ref ?? ""}
          readOnly
        />
      ))}

      <MatchNewPlayerButton href={maatjesHref} />
    </div>
  );
}

function CourtSlotDisplay({
  name,
  level,
  isAppUser = true,
  fixed,
}: {
  name: string;
  level: PadelLevel | null;
  isAppUser?: boolean;
  fixed?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <PlayerAvatar name={name} variant={fixed ? "confirmed" : "default"} />
      <span className="w-full truncate text-center text-xs font-medium">
        {name}
      </span>
      <LevelBadge level={level} isAppUser={isAppUser} />
    </div>
  );
}

function CourtSlotButton({
  slotIndex,
  name,
  level,
  isAppUser = false,
  isActive,
  onSelect,
  onClear,
}: {
  slotIndex: number;
  name?: string;
  level: PadelLevel | null;
  isAppUser?: boolean;
  isActive: boolean;
  onSelect: () => void;
  onClear: () => void;
}) {
  const filled = Boolean(name);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={isActive}
          className={`rounded-full transition ${
            isActive ? "ring-2 ring-primary ring-offset-2" : ""
          }`}
        >
          {filled && name ? (
            <PlayerAvatar name={name} variant="confirmed" />
          ) : (
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary/50 bg-primary/5 text-xl font-medium text-primary">
              +
            </span>
          )}
        </button>
        {filled && name ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`${name} van de baan halen`}
            className="absolute -right-0.5 -top-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-destructive text-destructive-foreground shadow-sm transition hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {filled && name ? (
        <>
          <span className="w-full truncate text-center text-xs font-medium">
            {name}
          </span>
          <LevelBadge level={level} isAppUser={isAppUser} />
        </>
      ) : (
        <span className="text-[10px] text-muted-foreground">Plek {slotIndex + 2}</span>
      )}
    </div>
  );
}

function PlayerAvatar({
  name,
  variant = "default",
}: {
  name: string;
  variant?: "default" | "confirmed";
}) {
  return (
    <span
      className={`inline-flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold ${
        variant === "confirmed"
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground"
      }`}
    >
      {initials(name)}
    </span>
  );
}

function LevelBadge({
  level,
  isAppUser = true,
}: {
  level: PadelLevel | null;
  isAppUser?: boolean;
}) {
  return (
    <span className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tabular-nums text-accent-foreground">
      {formatPadelLevelLabel(level, isAppUser)}
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
