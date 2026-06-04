import { useEffect, useState } from "react";
import {
  formatPadelLevel,
  levelsForGender,
  stepLevel,
  type Gender,
  type PadelLevel,
} from "~/types/domain";

export type MatchCascadeSettingsProps = {
  gender: Gender | null;
  level: PadelLevel | null;
  matchLevelMin: PadelLevel | null;
  matchLevelMax: PadelLevel | null;
  invitedCount: number;
  inviteFriendsEnabled: boolean;
  onInviteFriendsChange: (enabled: boolean) => void;
  fallbackToLevelRange: boolean;
  fallbackLevelMin: PadelLevel | null;
  fallbackLevelMax: PadelLevel | null;
  fallbackLevelDelayMinutes: number;
};

export function MatchCascadeSettings({
  gender,
  level,
  matchLevelMin,
  matchLevelMax,
  invitedCount,
  inviteFriendsEnabled: friendsOn,
  onInviteFriendsChange,
  fallbackToLevelRange: initialRangeOn,
  fallbackLevelMin,
  fallbackLevelMax,
  fallbackLevelDelayMinutes,
}: MatchCascadeSettingsProps) {
  const available = levelsForGender(gender);
  const defaultMin: PadelLevel =
    fallbackLevelMin ??
    matchLevelMin ??
    (level !== null ? stepLevel(level, "down", gender) : available[0]!);
  const defaultMax: PadelLevel =
    fallbackLevelMax ??
    matchLevelMax ??
    (level !== null
      ? stepLevel(level, "up", gender)
      : available[available.length - 1]!);

  const rangeForced = !friendsOn;
  const [rangeOn, setRangeOn] = useState(
    friendsOn ? initialRangeOn : true,
  );
  const [delayMinutes, setDelayMinutes] = useState(() =>
    friendsOn ? fallbackLevelDelayMinutes : 0,
  );

  useEffect(() => {
    if (!friendsOn) {
      setRangeOn(true);
      setDelayMinutes(0);
    }
  }, [friendsOn]);

  const friendsSub = friendsOn
    ? invitedCount > 0
      ? `${invitedCount} al gekozen — pas aan in de volgende stap`
      : "Kies in de volgende stap wie je uitnodigt"
    : "Uitgeschakeld — we zoeken via klassement-range";

  return (
    <div className="space-y-4">
      <CascadeStep number={1} title="Je vrienden" sub={friendsSub}>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="inviteFriendsEnabled"
            checked={friendsOn}
            onChange={(e) => onInviteFriendsChange(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          <span className="text-sm font-medium">Inschakelen</span>
        </label>
      </CascadeStep>

      <CascadeStep
        number={2}
        title="Spelers in een klassement-range"
        sub="Indien nodig sturen we een 2e golf naar spelers met een passend P-klassement."
      >
        {rangeForced ? (
          <>
            <input type="hidden" name="fallbackToLevelRange" value="on" />
            <input type="hidden" name="fallbackLevelDelayMinutes" value="0" />
          </>
        ) : null}

        <label
          className={`flex items-center gap-3 ${
            rangeForced ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          }`}
        >
          <input
            type="checkbox"
            name={rangeForced ? undefined : "fallbackToLevelRange"}
            checked={rangeOn}
            disabled={rangeForced}
            onChange={(e) => setRangeOn(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          <span className="text-sm font-medium">Inschakelen</span>
        </label>

        {rangeOn && gender !== null && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <RangeSelect
                name="fallbackLevelMin"
                label="Min"
                options={available}
                defaultValue={defaultMin}
              />
              <RangeSelect
                name="fallbackLevelMax"
                label="Max"
                options={available}
                defaultValue={defaultMax}
              />
            </div>
            <DelaySelect
              name={rangeForced ? undefined : "fallbackLevelDelayMinutes"}
              label="Activeren na"
              value={delayMinutes}
              onChange={rangeForced ? undefined : setDelayMinutes}
              disabled={rangeForced}
            />
          </>
        )}
        {rangeOn && gender === null && (
          <p className="mt-2 text-xs text-amber-700">
            Stel eerst je geslacht in je profiel in om een P-range te kiezen.
          </p>
        )}
      </CascadeStep>

      <CascadeStep
        number={3}
        title="Iedereen"
        sub="Als laatste redmiddel sturen we ook naar alle andere PadelMatch-spelers."
        comingSoon
      />
    </div>
  );
}

function CascadeStep({
  number,
  title,
  sub,
  comingSoon,
  children,
}: {
  number: number;
  title: string;
  sub: string;
  comingSoon?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border bg-card p-4 ${
        comingSoon ? "border-border opacity-60" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
          {number}
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{title}</p>
            {comingSoon ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Binnenkort
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </section>
  );
}

function RangeSelect({
  name,
  label,
  options,
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  options: readonly PadelLevel[];
  defaultValue: PadelLevel;
  disabled?: boolean;
}) {
  return (
    <label className={`block ${disabled ? "opacity-50" : ""}`}>
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        name={disabled ? undefined : name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      >
        {options.map((lvl) => (
          <option key={lvl} value={lvl}>
            {formatPadelLevel(lvl)}
          </option>
        ))}
      </select>
    </label>
  );
}

const DELAY_OPTIONS = [0, 15, 30, 60, 120, 240] as const;

function DelaySelect({
  name,
  label,
  value,
  onChange,
  disabled,
}: {
  name?: string;
  label: string;
  value: number;
  onChange?: (minutes: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`mt-3 block ${disabled ? "opacity-50" : ""}`}>
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        name={name}
        value={value}
        disabled={disabled}
        onChange={
          onChange
            ? (e) => onChange(Number.parseInt(e.target.value, 10))
            : undefined
        }
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      >
        {DELAY_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m === 0 ? "Onmiddellijk" : `${m} min`}
          </option>
        ))}
      </select>
    </label>
  );
}
