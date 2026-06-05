import { Link } from "react-router";
import type { DraftOverviewData } from "~/lib/match-draft-overview.server";

export type MatchDraftOverviewCardProps = {
  data: DraftOverviewData;
  token: string;
  /** Show "Bewerken" links into the wizard (default true). */
  editable?: boolean;
  className?: string;
};

export function MatchDraftOverviewCard({
  data,
  token,
  editable = true,
  className = "",
}: MatchDraftOverviewCardProps) {
  const clubLine =
    data.clubs.length === 0
      ? "Club nog te kiezen"
      : data.clubs.map((c) => `${c.name} · ${c.city}`).join(" · ");

  return (
    <article
      className={`overflow-hidden rounded-3xl border border-border bg-card shadow-soft ${className}`}
    >
      <header className="border-b border-border/60 bg-gradient-to-br from-accent/15 via-card to-card px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">
              Match-overzicht
            </p>
            <h1 className="mt-1 font-display text-xl font-bold leading-tight">
              {data.whenLabel !== "—" ? data.whenLabel.split(" · ")[0] : "Nieuwe match"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{clubLine}</p>
          </div>
          <span className="flex-none rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            Concept
          </span>
        </div>
      </header>

      <div className="p-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OverviewField
            label="Wanneer"
            value={data.whenLabel}
            editTo={editable ? `/match/nieuw/${token}/wanneer` : undefined}
          />
          <OverviewField
            label="Formaat"
            value={data.formatLabel}
            editTo={editable ? `/match/nieuw/${token}/formaat` : undefined}
          />
          <OverviewField
            label="Open plekken"
            value={data.openSlotsLabel}
            editTo={editable ? `/match/nieuw/${token}/spelers` : undefined}
          />
          <OverviewField
            label="Vrienden uitnodigen"
            value={data.invitedLabel}
            editTo={editable ? `/match/nieuw/${token}/maatjes` : undefined}
          />
          <OverviewField
            label="Uitnodigen"
            value={data.cascadeLabel}
            editTo={editable ? `/match/nieuw/${token}/uitnodigen` : undefined}
            className="sm:col-span-2"
          />
        </dl>

        <section className="mt-4 rounded-2xl border border-border bg-secondary/25 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Op de baan
          </p>
          {data.confirmedSlotNames.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nog niemand</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.confirmedSlotNames.map((name) => (
                <li
                  key={name}
                  className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <Link
              to={`/match/nieuw/${token}/spelers`}
              className="mt-3 inline-block text-xs font-medium text-accent transition hover:underline"
            >
              Spelers aanpassen →
            </Link>
          )}
        </section>
      </div>
    </article>
  );
}

function OverviewField({
  label,
  value,
  editTo,
  className = "",
}: {
  label: string;
  value: string;
  editTo?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border/80 bg-background/60 px-4 py-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {editTo && (
          <Link
            to={editTo}
            className="flex-none text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            Bewerken
          </Link>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-snug">{value}</p>
    </div>
  );
}
