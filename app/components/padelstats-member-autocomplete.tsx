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

type Props = {
  selected: PadelstatsMemberHit | null;
  onSelect: (member: PadelstatsMemberHit | null) => void;
};

export function PadelstatsMemberAutocomplete({ selected, onSelect }: Props) {
  const listId = useId();
  const [query, setQuery] = useState(selected?.name ?? "");
  const [members, setMembers] = useState<PadelstatsMemberHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(selected?.name ?? "");
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
        const res = await fetch(
          `/api/padelstats/members/search?q=${encodeURIComponent(q)}`,
        );
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

  return (
    <div className="space-y-1.5">
      <input type="hidden" name="tvMemberId" value={selected?.id ?? ""} />
      <input type="hidden" name="clubId" value={selected?.clubId ?? ""} />

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Je naam</span>
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (selected) onSelect(null);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
            placeholder="bijv. Pascal Van Hecke"
          />

          {showDropdown && (
            <ul
              id={listId}
              role="listbox"
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-soft"
            >
              {loading && (
                <li className="px-4 py-2 text-sm text-muted-foreground">
                  Zoeken…
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
                        setQuery(m.name);
                        setOpen(false);
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
                  Geen spelers gevonden. Controleer de spelling of probeer alleen
                  je familienaam.
                </li>
              )}
            </ul>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          Typ minstens {MEMBER_SEARCH_MIN_QUERY_LENGTH} tekens — volgorde van
          voornaam en familienaam maakt niet uit.
        </span>
      </label>

      <div className="min-h-5">
        {selected ? (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {selected.name}
              {selected.rankLabel && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {selected.rankLabel}
                </span>
              )}
            </span>
            <MemberOptionMeta member={selected} />
            <button
              type="button"
              className="mt-1 font-medium text-primary hover:underline"
              onClick={() => {
                onSelect(null);
                setQuery("");
                setOpen(true);
              }}
            >
              wijzigen
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
