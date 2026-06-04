import { useEffect, useId, useRef, useState } from "react";
import type { PadelstatsMemberHit } from "~/lib/padelstats-catalog.types";
import { MEMBER_SEARCH_MIN_QUERY_LENGTH } from "~/lib/padelstats-member-search.shared";

function MemberOptionMeta({ member }: { member: PadelstatsMemberHit }) {
  if (!member.clubName) return null;
  return (
    <span className="mt-0.5 block text-xs text-muted-foreground">
      {member.clubName}
    </span>
  );
}

function formatSelectedValue(member: PadelstatsMemberHit): string {
  const parts = [member.name, member.rankLabel, member.clubName].filter(Boolean);
  return parts.join(" · ");
}

type Props = {
  selected: PadelstatsMemberHit | null;
  onSelect: (member: PadelstatsMemberHit | null) => void;
};

export function PadelstatsMemberAutocomplete({ selected, onSelect }: Props) {
  const listId = useId();
  const hintId = useId();
  const [query, setQuery] = useState(selected ? formatSelectedValue(selected) : "");
  const [members, setMembers] = useState<PadelstatsMemberHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const [pickHint, setPickHint] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(selected ? formatSelectedValue(selected) : "");
    setPickHint(false);
  }, [selected]);

  useEffect(() => {
    const q = query.trim();
    if (selected || q.length < MEMBER_SEARCH_MIN_QUERY_LENGTH) {
      setMembers([]);
      setLoading(false);
      setSearched(false);
      setError(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(false);
      setSearched(false);
      try {
        const res = await fetch("/api/padelstats/members/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q }),
        });
        const data = (await res.json()) as { members?: PadelstatsMemberHit[] };
        if (!res.ok) {
          setError(true);
          setMembers([]);
        } else {
          setMembers(data.members ?? []);
        }
      } catch {
        setError(true);
        setMembers([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 280);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length >= MEMBER_SEARCH_MIN_QUERY_LENGTH;
  const showDropdown =
    open &&
    !selected &&
    canSearch &&
    (loading || searched);

  const needsPickFromList =
    !selected &&
    canSearch &&
    searched &&
    !loading &&
    !error &&
    members.length > 0;

  const showPickHint = pickHint && needsPickFromList;

  const helperText = selected
    ? "Geselecteerd — je WhatsApp-nummer koppelen we aan dit profiel op Tennis & Padel Vlaanderen."
    : showPickHint
      ? "Selecteer jezelf in de TV-lijst. Vrije tekst is niet geldig."
      : canSearch && searched && !loading && members.length === 0 && !error
        ? "Geen clublid gevonden bij TV. Controleer de spelling of zoek op familienaam."
        : `Zoek in de TV-clubleden (min. ${MEMBER_SEARCH_MIN_QUERY_LENGTH} tekens) en selecteer je profiel.`;

  return (
    <div className="space-y-1.5">
      <input type="hidden" name="tvMemberId" value={selected?.id ?? ""} />
      <input type="hidden" name="clubId" value={selected?.clubId ?? ""} />

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Zoek je profiel op Tennis & Padel Vlaanderen
        </span>
        <span className="block text-xs leading-relaxed text-muted-foreground">
          Sta je ingeschreven bij een club? Zoek je naam in de officiële
          clubledenlijst en selecteer jezelf. Zo koppelen we je WhatsApp-nummer
          straks aan het juiste TV-profiel.
        </span>
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setPickHint(false);
              if (selected) onSelect(null);
            }}
            onFocus={() => {
              setOpen(true);
              if (selected) {
                onSelect(null);
                setQuery("");
              }
            }}
            onBlur={() => {
              setTimeout(() => {
                setOpen(false);
                if (!selected && needsPickFromList) setPickHint(true);
              }, 150);
            }}
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            aria-describedby={helperText ? hintId : undefined}
            aria-invalid={showPickHint}
            readOnly={!!selected}
            className={`w-full rounded-xl border bg-background py-3 pl-4 text-base ${
              selected ? "cursor-default pr-14" : "pr-4"
            } ${
              showPickHint
                ? "border-amber-500/70 ring-2 ring-amber-500/20"
                : selected
                  ? "border-primary/40 ring-2 ring-primary/15"
                  : "border-input"
            }`}
            placeholder="Zoek je naam zoals bij TV (bv. Van Hecke Pascal)"
          />

          {selected && (
            <button
              type="button"
              className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-primary hover:underline"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(null);
                setQuery("");
                setOpen(true);
              }}
            >
              Wijzigen
            </button>
          )}

          {showDropdown && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Clubleden Tennis en Padel Vlaanderen"
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-soft"
            >
              {!loading && members.length > 0 && (
                <li
                  className="border-b border-border/80 px-4 py-2 text-xs font-medium text-muted-foreground"
                  aria-hidden
                >
                  Selecteer je TV-profiel
                </li>
              )}
              {loading && (
                <li className="px-4 py-2 text-sm text-muted-foreground">
                  Zoeken in TV-clubleden…
                </li>
              )}
              {!loading &&
                members.map((m) => (
                  <li key={m.id} role="option">
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 text-left hover:bg-secondary/80"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onSelect(m);
                        setQuery(formatSelectedValue(m));
                        setOpen(false);
                        setPickHint(false);
                      }}
                    >
                      <span className="block text-sm font-medium text-foreground">
                        {m.name}
                        {m.rankLabel && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {m.rankLabel}
                          </span>
                        )}
                      </span>
                      <MemberOptionMeta member={m} />
                    </button>
                  </li>
                ))}
              {!loading && error && (
                <li className="px-4 py-2 text-sm text-destructive">
                  Zoeken mislukt. Probeer opnieuw.
                </li>
              )}
              {!loading && !error && searched && members.length === 0 && (
                <li className="px-4 py-2 text-sm text-muted-foreground">
                  Geen clublid gevonden bij Tennis & Padel Vlaanderen.
                  Controleer de spelling of zoek op familienaam.
                </li>
              )}
            </ul>
          )}
        </div>
        {helperText && (
          <span
            id={hintId}
            className={`block text-xs ${
              showPickHint ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"
            }`}
          >
            {helperText}
          </span>
        )}
      </label>
    </div>
  );
}
