import { useEffect, useRef } from "react";
import {
  Form,
  Link,
  redirect,
  useFetcher,
  useNavigate,
  useSearchParams,
} from "react-router";
import { formatPersonName } from "~/lib/person-name";
import type { Route } from "./+types/dev.simulator";
import { assertDevOnly } from "~/lib/dev-guard.server";
import { inboundFromUser } from "~/lib/dev-inbound.server";
import {
  createDevTestUser,
  findUserById,
  getDatabase,
  getMessagesForUser,
} from "~/lib/db.server";
import { handleIncomingMessage } from "~/lib/whatsapp-bot.server";
import { runCascadeTick, type TickTrace } from "~/lib/cascade/runner.server";

const QUICK_COMMANDS = ["JA", "FRIENDS", "HELP", "STOP"] as const;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "WhatsApp simulator — Zin in Padel" },
    {
      name: "description",
      content: "Lokale WhatsApp-emulatie voor ontwikkeling",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  assertDevOnly();

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const db = await getDatabase();

  const users = db.users.map((u) => ({
    id: u.id,
    profileName: u.profileName,
    waId: u.waId,
    manageToken: u.manageToken,
    optedIn: u.optedIn,
    activeFlow: u.activeFlow,
  }));

  if (!userId) {
    return { users, selectedUser: null, messages: [] };
  }

  const selectedUser = await findUserById(userId);
  if (!selectedUser) {
    return { users, selectedUser: null, messages: [] };
  }

  const messages = await getMessagesForUser(userId);

  return {
    users,
    selectedUser: {
      id: selectedUser.id,
      profileName: selectedUser.profileName,
      waId: selectedUser.waId,
      manageToken: selectedUser.manageToken,
      optedIn: selectedUser.optedIn,
      activeFlow: selectedUser.activeFlow,
      pendingFriend: selectedUser.pendingFriend,
    },
    messages,
  };
}

export async function action({ request }: Route.ActionArgs) {
  assertDevOnly();

  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  if (intent === "create-user") {
    const profileName = form.get("profileName")?.toString() ?? "";
    const user = await createDevTestUser(profileName);
    return redirect(`/dev/simulator?userId=${user.id}`);
  }

  if (intent === "cron-tick") {
    const atParam = form.get("at")?.toString();
    const now = atParam ? new Date(atParam) : new Date();
    if (Number.isNaN(now.getTime())) {
      return { ok: false as const, error: "invalid_at" };
    }
    const trace = await runCascadeTick(now);
    return { ok: true as const, intent: "cron-tick" as const, trace };
  }

  if (intent === "send") {
    const userId = form.get("userId")?.toString();
    const body = form.get("body")?.toString() ?? "";

    if (!userId) {
      return { ok: false as const, error: "missing_user" };
    }

    const user = await findUserById(userId);
    if (!user) {
      return { ok: false as const, error: "user_not_found" };
    }

    const inbound = inboundFromUser(user, body);
    const appOrigin = new URL(request.url).origin;
    await handleIncomingMessage(inbound, { appOrigin });

    return redirect(`/dev/simulator?userId=${userId}`);
  }

  return { ok: false as const, error: "unknown_intent" };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DevSimulator({ loaderData }: Route.ComponentProps) {
  const { users, selectedUser, messages } = loaderData;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fetcher = useFetcher<
    | { ok: false; error: string }
    | { ok: true; intent: "cron-tick"; trace: TickTrace }
  >();
  const cronFetcher = useFetcher<
    | { ok: false; error: string }
    | { ok: true; intent: "cron-tick"; trace: TickTrace }
  >();
  const threadEndRef = useRef<HTMLDivElement>(null);
  const userId = searchParams.get("userId") ?? "";

  const isSending = fetcher.state !== "idle";

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleUserChange(nextUserId: string) {
    if (nextUserId) {
      navigate(`/dev/simulator?userId=${nextUserId}`);
    } else {
      navigate("/dev/simulator");
    }
  }

  function sendCommand(command: string) {
    if (!selectedUser) return;
    const formData = new FormData();
    formData.set("intent", "send");
    formData.set("userId", selectedUser.id);
    formData.set("body", command);
    fetcher.submit(formData, { method: "post" });
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="shrink-0 border-b border-gray-200 px-4 py-4 dark:border-gray-800">
          <Link
            to="/"
            className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
          >
            ← Dashboard
          </Link>
          {selectedUser?.manageToken && (
            <Link
              to={`/maatjes/${selectedUser.manageToken}`}
              className="mt-1 block text-xs text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Mijn maatjes →
            </Link>
          )}
          <h1 className="mt-2 text-base font-semibold tracking-tight">
            WhatsApp simulator
          </h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Emuleert Twilio
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div>
            <label
              htmlFor="user-select"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Gebruiker
            </label>
            <select
              id="user-select"
              value={userId}
              onChange={(e) => handleUserChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            >
              <option value="">— Kies —</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {formatPersonName({
                    firstName: user.firstName,
                    lastName: user.lastName,
                    profileName: user.profileName,
                    fallback: user.waId,
                  })}
                  {user.optedIn ? " · opt-in" : ""}
                  {user.activeFlow ? ` · ${user.activeFlow}` : ""}
                </option>
              ))}
            </select>
          </div>

          <Form method="post" className="flex flex-col gap-2">
            <input type="hidden" name="intent" value="create-user" />
            <input
              name="profileName"
              type="text"
              placeholder="Voornaam familienaam"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            />
            <button
              type="submit"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              + Testgebruiker
            </button>
          </Form>

          {selectedUser && (
            <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-4 text-xs dark:border-gray-800">
              <StatusPill
                label={selectedUser.optedIn ? "Opt-in" : "Geen opt-in"}
                active={selectedUser.optedIn}
              />
              <StatusPill
                label={
                  selectedUser.activeFlow
                    ? `Flow: ${selectedUser.activeFlow}`
                    : "Geen actieve flow"
                }
                active={Boolean(selectedUser.activeFlow)}
              />
              {selectedUser.pendingFriend && (
                <span className="text-amber-700 dark:text-amber-400">
                  Wacht op tel.: {selectedUser.pendingFriend.name}
                </span>
              )}
              <code className="break-all rounded bg-gray-100 px-1.5 py-1 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {selectedUser.waId}
              </code>
            </div>
          )}

          <CronTickPanel fetcher={cronFetcher} />
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#e5ddd5] dark:bg-gray-900">
        {selectedUser ? (
          <>
            <header className="shrink-0 border-b border-gray-300/60 bg-[#f0f2f5] px-4 py-3 dark:border-gray-700 dark:bg-gray-950">
              <p className="font-medium">
                {formatPersonName({
                  firstName: selectedUser.firstName,
                  lastName: selectedUser.lastName,
                  profileName: selectedUser.profileName,
                  fallback: selectedUser.waId,
                })}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Zin in Padel · WhatsApp
              </p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mx-auto max-w-3xl space-y-2">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">
                    Nog geen berichten voor deze gebruiker.
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "in" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow ${
                          msg.direction === "in"
                            ? "bg-[#d9fdd3] text-gray-900 dark:bg-emerald-900/50 dark:text-gray-100"
                            : "bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {msg.body || (
                            <span className="italic text-gray-400">
                              (leeg bericht)
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-right text-[10px] text-gray-500 dark:text-gray-400">
                          {formatTime(msg.at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={threadEndRef} />
              </div>
            </div>

            <footer className="shrink-0 border-t border-gray-300/60 bg-[#f0f2f5] p-3 dark:border-gray-700 dark:bg-gray-950">
              <div className="mx-auto max-w-3xl">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {QUICK_COMMANDS.map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      disabled={isSending}
                      onClick={() => sendCommand(cmd)}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
                <fetcher.Form method="post" className="flex gap-2">
                  <input type="hidden" name="intent" value="send" />
                  <input type="hidden" name="userId" value={selectedUser.id} />
                  <input
                    name="body"
                    type="text"
                    required
                    disabled={isSending}
                    placeholder="Typ een WhatsApp-bericht…"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={isSending}
                    className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isSending ? "…" : "Verstuur"}
                  </button>
                </fetcher.Form>
                {fetcher.data?.ok === false && (
                  <p className="mt-2 text-xs text-red-600">
                    Fout: {fetcher.data.error}
                  </p>
                )}
              </div>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="max-w-sm text-center text-sm text-gray-600 dark:text-gray-400">
              Kies een gebruiker links om het WhatsApp-gesprek te zien en
              berichten te versturen.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

type CronFetcherData =
  | { ok: false; error: string }
  | { ok: true; intent: "cron-tick"; trace: TickTrace }
  | undefined;

function CronTickPanel({
  fetcher,
}: {
  fetcher: ReturnType<typeof useFetcher<CronFetcherData>>;
}) {
  const data = fetcher.data;
  const isTicking = fetcher.state !== "idle";
  return (
    <div className="flex flex-col gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
        Cascade cron
      </p>
      <fetcher.Form method="post" className="flex flex-col gap-1.5">
        <input type="hidden" name="intent" value="cron-tick" />
        <input
          type="datetime-local"
          name="at"
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-950"
          title="Optioneel: tijdreis naar deze instant. Leeg = nu."
        />
        <button
          type="submit"
          disabled={isTicking}
          className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
        >
          {isTicking ? "Tikken…" : "⏱ Tick cron"}
        </button>
      </fetcher.Form>
      {data && data.ok === false && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{data.error}</p>
      )}
      {data && data.ok === true && (
        <div className="rounded-lg bg-gray-100 p-2 text-[10px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <p>
            <strong>{data.trace.matchesConsidered}</strong> match
            {data.trace.matchesConsidered === 1 ? "" : "es"} bekeken
          </p>
          {data.trace.perMatch.length === 0 ? (
            <p className="mt-1 italic text-gray-500">geen plannen</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {data.trace.perMatch.map((entry) => (
                <li key={entry.matchId} className="break-all">
                  <code>{entry.matchId.slice(0, 8)}</code>:{" "}
                  {summarisePlan(entry.plan)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function summarisePlan(plan: TickTrace["perMatch"][number]["plan"]): string {
  switch (plan.kind) {
    case "idle":
      return `idle (${plan.reason})`;
    case "fire-phase":
      return `fire phase ${plan.phase} (+${plan.invitesInserted} invites)`;
    case "mark-full":
      return "mark-full (stale schedule opgeruimd)";
    case "mark-exhausted":
      return "mark-exhausted";
  }
}

function StatusPill({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "rounded-full bg-gray-100 px-2.5 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
      }
    >
      {label}
    </span>
  );
}
