import type { Route } from "./+types/admin._index";
import { getDatabase } from "~/lib/db.server";
import { resolveUserNameParts } from "~/lib/person-name";
import {
  countWaitlistSignups,
  listWaitlistSignups,
} from "~/lib/waitlist.server";
import { getReferralAdminSummary } from "~/lib/referrals.server";
import { formatPadelLevel, isPadelLevel } from "~/types/domain";

export function meta() {
  return [
    { title: "Zin in Padel — Admin" },
    { name: "description", content: "WhatsApp bot dashboard" },
  ];
}

export async function loader() {
  const db = await getDatabase();
  const [waitlistCount, waitlist, referralSummary] = await Promise.all([
    countWaitlistSignups(),
    listWaitlistSignups(),
    getReferralAdminSummary(),
  ]);

  return {
    waitlistCount,
    waitlist,
    referralSummary,
    users: db.users.map((u) => ({
      ...u,
      maatjesPath: `/maatjes/${u.manageToken}`,
    })),
    games: db.games,
    messageCount: db.messages.length,
    stats: {
      totalUsers: db.users.length,
      optedIn: db.users.filter((user) => user.optedIn).length,
      onboardingComplete: db.users.filter((user) => user.onboardingComplete)
        .length,
    },
  };
}

function StatusBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={
        active
          ? "inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
      }
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const {
    users,
    games,
    messageCount,
    stats,
    waitlistCount,
    waitlist,
    referralSummary,
  } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Zin in Padel
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              WhatsApp bot — admin dashboard
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Webhook:{" "}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                POST /webhooks/twilio/whatsapp
              </code>
            </p>
            {import.meta.env.DEV && (
              <a
                href="/dev/simulator"
                className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                WhatsApp simulator →
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Wachtlijst" value={waitlistCount} />
          <StatCard label="Gebruikers" value={stats.totalUsers} />
          <StatCard label="Opt-in" value={stats.optedIn} />
          <StatCard
            label="Onboarding voltooid"
            value={stats.onboardingComplete}
          />
          <StatCard label="Berichten" value={messageCount} />
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800 sm:px-6">
            <h2 className="text-lg font-medium">Vriendenactie</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Referrals tellen mee zodra de nieuwe gebruiker opt-in doet via
              WhatsApp.
            </p>
          </div>
          <div className="grid gap-4 border-b border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-3 sm:p-6">
            <StatCard label="Pending" value={referralSummary.pendingCount} />
            <StatCard label="Gekwalificeerd" value={referralSummary.qualifiedCount} />
            <StatCard label="Uitgesloten" value={referralSummary.disqualifiedCount} />
          </div>
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">Top referrers</h3>
              {referralSummary.leaderboard.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  Nog geen gekwalificeerde referrals.
                </p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {referralSummary.leaderboard.map((entry, index) => (
                    <li
                      key={entry.userId}
                      className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-950/50"
                    >
                      <span>
                        {index + 1}. {entry.displayName}
                      </span>
                      <span className="font-medium">
                        {entry.qualifiedCount}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">Recente referrals</h3>
              {referralSummary.recent.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  Nog geen referral-attributies.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {referralSummary.recent.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-950/50"
                    >
                      <div className="flex justify-between gap-3">
                        <span>
                          {row.inviterName} → {row.referredName}
                        </span>
                        <span className="font-medium">
                          {formatReferralStatus(row.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(row.attributedAt.toISOString())}
                        {row.qualifiedAt
                          ? ` · gekwalificeerd ${formatDate(row.qualifiedAt.toISOString())}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800 sm:px-6">
            <h2 className="text-lg font-medium">Wachtlijst (landing)</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Viability-signups van de publieke homepage.
            </p>
          </div>
          {waitlist.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 sm:px-6">
              Nog geen inschrijvingen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/50">
                  <tr>
                    <Th>Speler</Th>
                    <Th>Telefoon</Th>
                    <Th>Club</Th>
                    <Th>P-klassement</Th>
                    <Th>Ingeschreven</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {waitlist.map((row) => (
                    <tr key={row.id}>
                      <Td>{row.member.name}</Td>
                      <Td>
                        <code className="text-xs">{row.phone}</code>
                      </Td>
                      <Td>
                        {row.club
                          ? `${row.club.name} (${row.club.city})`
                          : "—"}
                      </Td>
                      <Td>
                        {isPadelLevel(row.member.currentRank)
                          ? formatPadelLevel(row.member.currentRank)
                          : `P${row.member.currentRank}`}
                      </Td>
                      <Td className="whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {formatDate(row.createdAt.toISOString())}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800 sm:px-6">
            <h2 className="text-lg font-medium">Gebruikers</h2>
          </div>
          {users.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 sm:px-6">
              Nog geen gebruikers. Stuur een WhatsApp-bericht naar de sandbox om
              te starten.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/50">
                  <tr>
                    <Th>Voornaam</Th>
                    <Th>Familienaam</Th>
                    <Th>WaId</Th>
                    <Th>Onboarding</Th>
                    <Th>Opt-in</Th>
                    <Th>Geslacht</Th>
                    <Th>Klassement</Th>
                    <Th>Vrienden</Th>
                    <Th>Persoonlijke link</Th>
                    <Th>Laatst bijgewerkt</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {users.map((user) => {
                    const { firstName, lastName } = resolveUserNameParts(user);
                    return (
                    <tr key={user.id}>
                      <Td>{firstName}</Td>
                      <Td>{lastName}</Td>
                      <Td>
                        <code className="text-xs">{user.waId}</code>
                      </Td>
                      <Td>
                        <StatusBadge
                          active={user.onboardingComplete}
                          activeLabel="Voltooid"
                          inactiveLabel="Bezig"
                        />
                      </Td>
                      <Td>
                        <StatusBadge
                          active={user.optedIn}
                          activeLabel="Ja"
                          inactiveLabel="Nee"
                        />
                      </Td>
                      <Td>
                        {user.gender === "m"
                          ? "Heren"
                          : user.gender === "w"
                            ? "Dames"
                            : "—"}
                      </Td>
                      <Td>
                        {user.level !== null ? formatPadelLevel(user.level) : "—"}
                      </Td>
                      <Td>{user.favoritePlayerRefs.length}</Td>
                      <Td>
                        <div className="flex gap-3">
                          <a
                            href={user.maatjesPath}
                            className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            Vrienden
                          </a>
                          <a
                            href={`/profiel/${user.manageToken}`}
                            className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            Profiel
                          </a>
                          <a
                            href={`/match/${user.manageToken}`}
                            className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            Matches
                          </a>
                          <a
                            href={`/match/nieuw/${user.manageToken}`}
                            className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            Match aanmaken
                          </a>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {formatDate(user.updatedAt)}
                      </Td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800 sm:px-6">
            <h2 className="text-lg font-medium">Wedstrijden</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-950/50">
                <tr>
                  <Th>Titel</Th>
                  <Th>Datum</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {games.map((game) => (
                  <tr key={game.id}>
                    <Td>{game.title}</Td>
                    <Td className="whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {formatDate(game.scheduledAt)}
                    </Td>
                    <Td>
                      <GameStatus status={game.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:px-6">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
      className={`px-4 py-3 text-sm sm:px-6 ${className}`}
      title={title}
    >
      {children}
    </td>
  );
}

function GameStatus({ status }: { status: string }) {
  const labels: Record<string, string> = {
    open: "Open",
    full: "Vol",
    cancelled: "Geannuleerd",
  };

  return (
    <span className="text-sm capitalize">{labels[status] ?? status}</span>
  );
}

function formatReferralStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: "In afwachting",
    qualified: "Gekwalificeerd",
    disqualified: "Uitgesloten",
  };
  return labels[status] ?? status;
}
