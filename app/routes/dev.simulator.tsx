import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  data,
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
  appendMessage,
  createDevTestUser,
  findUserById,
  getDatabase,
  getMessagesForUser,
} from "~/lib/db.server";
import { resetDevSimulatorUser } from "~/lib/dev-reset-user.server";
import { processInboundReply } from "~/lib/whatsapp-bot.server";
import { runCascadeTick, type TickTrace } from "~/lib/cascade/runner.server";
import { runSendTick, type SendTickTrace } from "~/lib/cascade/send-worker.server";
import type { ActiveFlow, Message, User } from "~/types/domain";

const QUICK_COMMANDS = ["JA", "FRIENDS", "HELP", "STOP"] as const;

type SimulatorUserSnapshot = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileName: string;
  waId: string;
  manageToken: string;
  optedIn: boolean;
  activeFlow: ActiveFlow;
  pendingFriend: { name: string } | null;
};

export type SimulatorSendResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      intent: "send-inbound";
      messages: Message[];
      user: SimulatorUserSnapshot;
      body: string;
    }
  | {
      ok: true;
      intent: "send-reply";
      messages: Message[];
      user: SimulatorUserSnapshot;
    };

function simulatorUserSnapshot(user: User): SimulatorUserSnapshot {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    waId: user.waId,
    manageToken: user.manageToken,
    optedIn: user.optedIn,
    activeFlow: user.activeFlow,
    pendingFriend: user.pendingFriend,
  };
}

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
    firstName: u.firstName,
    lastName: u.lastName,
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
      firstName: selectedUser.firstName,
      lastName: selectedUser.lastName,
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

  if (intent === "send-tick") {
    const atParam = form.get("at")?.toString();
    const now = atParam ? new Date(atParam) : new Date();
    if (Number.isNaN(now.getTime())) {
      return { ok: false as const, error: "invalid_at" };
    }
    const trace = await runSendTick(now);
    return { ok: true as const, intent: "send-tick" as const, trace };
  }

  if (intent === "send-inbound") {
    const userId = form.get("userId")?.toString();
    const body = form.get("body")?.toString() ?? "";

    if (!userId) {
      return data({ ok: false, error: "missing_user" } satisfies SimulatorSendResponse);
    }

    const user = await findUserById(userId);
    if (!user) {
      return data({ ok: false, error: "user_not_found" } satisfies SimulatorSendResponse);
    }

    const trimmed = body.trim();
    if (!trimmed) {
      return data({ ok: false, error: "empty_body" } satisfies SimulatorSendResponse);
    }

    await appendMessage(userId, trimmed, "in");
    const messages = await getMessagesForUser(userId);
    const updated = await findUserById(userId);
    if (!updated) {
      return data({ ok: false, error: "user_not_found" } satisfies SimulatorSendResponse);
    }

    return data({
      ok: true,
      intent: "send-inbound",
      messages,
      user: simulatorUserSnapshot(updated),
      body: trimmed,
    } satisfies SimulatorSendResponse);
  }

  if (intent === "send-reply") {
    const userId = form.get("userId")?.toString();
    const body = form.get("body")?.toString() ?? "";

    if (!userId) {
      return data({ ok: false, error: "missing_user" } satisfies SimulatorSendResponse);
    }

    const user = await findUserById(userId);
    if (!user) {
      return data({ ok: false, error: "user_not_found" } satisfies SimulatorSendResponse);
    }

    const trimmed = body.trim();
    if (!trimmed) {
      return data({ ok: false, error: "empty_body" } satisfies SimulatorSendResponse);
    }

    const inbound = inboundFromUser(user, trimmed);
    const appOrigin = new URL(request.url).origin;
    await processInboundReply(user, inbound, { appOrigin });

    const messages = await getMessagesForUser(userId);
    const updated = await findUserById(userId);
    if (!updated) {
      return data({ ok: false, error: "user_not_found" } satisfies SimulatorSendResponse);
    }

    return data({
      ok: true,
      intent: "send-reply",
      messages,
      user: simulatorUserSnapshot(updated),
    } satisfies SimulatorSendResponse);
  }

  if (intent === "reset-user") {
    const userId = form.get("userId")?.toString();
    if (!userId) {
      return { ok: false as const, error: "missing_user" };
    }

    const user = await findUserById(userId);
    if (!user) {
      return { ok: false as const, error: "user_not_found" };
    }

    const result = await resetDevSimulatorUser(userId);
    return redirect(
      `/dev/simulator?userId=${userId}&reset=${result.messagesDeleted}`,
    );
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

/**
 * Detect the two cascade invite CTA URLs (accept + decline) in a Message body
 * and split them out so the simulator can render them as WhatsApp-style CTA
 * buttons. The body text returned has the URL lines stripped so they aren't
 * shown twice. Button labels mirror what we'll register as the real Meta
 * WhatsApp template — plain text, ≤20 chars, no emoji (Meta constraint).
 */
function extractInviteButtons(body: string): {
  body: string;
  buttons: Array<{ label: string; url: string }> | null;
} {
  // Match `✅ Ja, ik doe mee: <url>` and `❌ Nee, andere keer: <url>`
  const acceptRe = /^✅ Ja, ik doe mee:\s+(\S+)\s*$/m;
  const declineRe = /^❌ Nee, andere keer:\s+(\S+)\s*$/m;
  const acceptMatch = body.match(acceptRe);
  const declineMatch = body.match(declineRe);
  if (!acceptMatch || !declineMatch) {
    return { body, buttons: null };
  }
  const stripped = body
    .replace(acceptRe, "")
    .replace(declineRe, "")
    // collapse the 3+ blank lines that strip leaves behind
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    body: stripped,
    buttons: [
      { label: "Ja, ik doe mee", url: acceptMatch[1] },
      { label: "Nee, andere keer", url: declineMatch[1] },
    ],
  };
}

export default function DevSimulator({ loaderData }: Route.ComponentProps) {
  const { users, selectedUser, messages } = loaderData;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fetcher = useFetcher<SimulatorSendResponse>();
  const replyFetcher = useFetcher<SimulatorSendResponse>();
  const cronFetcher = useFetcher<
    | { ok: false; error: string }
    | { ok: true; intent: "cron-tick"; trace: TickTrace }
    | { ok: true; intent: "send-tick"; trace: SendTickTrace }
  >();
  const threadEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const wasSendingRef = useRef(false);
  const sendPhaseRef = useRef<"idle" | "inbound" | "reply">("idle");
  const inboundHandledRef = useRef(false);
  const [messageBody, setMessageBody] = useState("");
  const [threadMessages, setThreadMessages] = useState(messages);
  const [liveUser, setLiveUser] = useState(selectedUser);
  const [pendingInbound, setPendingInbound] = useState<string | null>(null);
  const userId = searchParams.get("userId") ?? "";
  const resetCount = searchParams.get("reset");
  const selectedUserId = selectedUser?.id;

  const isSending =
    fetcher.state !== "idle" || replyFetcher.state !== "idle";
  const isAwaitingReply = replyFetcher.state !== "idle";

  function focusMessageInput() {
    messageInputRef.current?.focus();
  }

  useEffect(() => {
    if (selectedUserId) {
      messageInputRef.current?.focus();
    }
  }, [selectedUserId]);

  useEffect(() => {
    const sending = fetcher.state !== "idle";
    if (wasSendingRef.current && !sending) {
      setMessageBody("");
      messageInputRef.current?.focus();
    }
    wasSendingRef.current = sending;
  }, [fetcher.state]);

  // Switching users — abort any in-flight send choreography.
  useEffect(() => {
    sendPhaseRef.current = "idle";
    inboundHandledRef.current = false;
    setPendingInbound(null);
    setThreadMessages(messages);
    setLiveUser(selectedUser);
  }, [selectedUserId]);

  // Loader revalidated (e.g. after reset) while idle — sync thread from server.
  useEffect(() => {
    if (
      sendPhaseRef.current !== "idle" ||
      fetcher.state !== "idle" ||
      replyFetcher.state !== "idle"
    ) {
      return;
    }
    setThreadMessages(messages);
    setLiveUser(selectedUser);
  }, [messages, selectedUser, fetcher.state, replyFetcher.state]);

  useEffect(() => {
    if (fetcher.state !== "idle" || sendPhaseRef.current !== "inbound") return;
    const payload = fetcher.data;
    if (!payload) return;
    if (inboundHandledRef.current) return;

    if (payload.ok === false) {
      sendPhaseRef.current = "idle";
      inboundHandledRef.current = false;
      setPendingInbound(null);
      return;
    }

    if (payload.intent !== "send-inbound") return;

    inboundHandledRef.current = true;
    sendPhaseRef.current = "reply";
    setPendingInbound(null);
    setThreadMessages(payload.messages);
    setLiveUser(payload.user);

    const replyForm = new FormData();
    replyForm.set("intent", "send-reply");
    replyForm.set("userId", payload.user.id);
    replyForm.set("body", payload.body);
    replyFetcher.submit(replyForm, { method: "post" });
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (replyFetcher.state !== "idle" || sendPhaseRef.current !== "reply") {
      return;
    }
    const payload = replyFetcher.data;
    if (!payload) return;

    if (payload.ok === false) {
      sendPhaseRef.current = "idle";
      inboundHandledRef.current = false;
      return;
    }

    if (payload.intent !== "send-reply") return;

    sendPhaseRef.current = "idle";
    inboundHandledRef.current = false;
    setThreadMessages(payload.messages);
    setLiveUser(payload.user);
  }, [replyFetcher.state, replyFetcher.data]);

  const displayMessages = useMemo(() => {
    if (!pendingInbound || !selectedUserId) return threadMessages;
    return [
      ...threadMessages,
      {
        id: "__pending_in",
        userId: selectedUserId,
        body: pendingInbound,
        direction: "in" as const,
        at: new Date().toISOString(),
      },
    ];
  }, [threadMessages, pendingInbound, selectedUserId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages.length, isAwaitingReply]);

  function handleUserChange(nextUserId: string) {
    if (nextUserId) {
      navigate(`/dev/simulator?userId=${nextUserId}`);
    } else {
      navigate("/dev/simulator");
    }
  }

  function submitMessage(body: string) {
    if (!selectedUser) return;
    const trimmed = body.trim();
    if (!trimmed || isSending) return;

    setPendingInbound(trimmed);
    sendPhaseRef.current = "inbound";
    inboundHandledRef.current = false;

    const formData = new FormData();
    formData.set("intent", "send-inbound");
    formData.set("userId", selectedUser.id);
    formData.set("body", trimmed);
    fetcher.submit(formData, { method: "post" });
    setMessageBody("");
    focusMessageInput();
  }

  function sendCommand(command: string) {
    submitMessage(command);
  }

  function handleSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitMessage(messageBody);
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
          <UserSearchSelect
            users={users}
            selectedUserId={userId}
            onSelect={handleUserChange}
          />

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

          {liveUser && (
            <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-4 text-xs dark:border-gray-800">
              <StatusPill
                label={liveUser.optedIn ? "Opt-in" : "Geen opt-in"}
                active={liveUser.optedIn}
              />
              <StatusPill
                label={
                  liveUser.activeFlow
                    ? `Flow: ${liveUser.activeFlow}`
                    : "Geen actieve flow"
                }
                active={Boolean(liveUser.activeFlow)}
              />
              {liveUser.pendingFriend && (
                <span className="text-amber-700 dark:text-amber-400">
                  Wacht op tel.: {liveUser.pendingFriend.name}
                </span>
              )}
              <code className="break-all rounded bg-gray-100 px-1.5 py-1 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {liveUser.waId}
              </code>
              <ResetUserForm userId={liveUser.id} />
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
                  firstName: liveUser?.firstName ?? selectedUser.firstName,
                  lastName: liveUser?.lastName ?? selectedUser.lastName,
                  profileName: liveUser?.profileName ?? selectedUser.profileName,
                  fallback: selectedUser.waId,
                })}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Zin in Padel · WhatsApp
              </p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mx-auto max-w-3xl space-y-2">
                {resetCount !== null && (
                  <p className="rounded-lg bg-emerald-100 px-3 py-2 text-center text-xs text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                    Gebruiker gereset
                    {resetCount !== "" ? ` (${resetCount} berichten gewist)` : ""}.
                    Stuur JA om opnieuw te starten.
                  </p>
                )}
                {displayMessages.length === 0 && !isAwaitingReply ? (
                  <p className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">
                    Nog geen berichten voor deze gebruiker.
                  </p>
                ) : (
                  displayMessages.map((msg) => {
                    const { body: bubbleBody, buttons } = extractInviteButtons(
                      msg.body ?? "",
                    );
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === "in" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] overflow-hidden rounded-lg text-sm shadow ${
                            msg.direction === "in"
                              ? "bg-[#d9fdd3] text-gray-900 dark:bg-emerald-900/50 dark:text-gray-100"
                              : "bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                          } ${msg.id === "__pending_in" ? "opacity-80" : ""}`}
                        >
                          <div className="px-3 py-2">
                            <p className="whitespace-pre-wrap break-words">
                              {bubbleBody || (
                                <span className="italic text-gray-400">
                                  (leeg bericht)
                                </span>
                              )}
                            </p>
                            <p className="mt-1 text-right text-[10px] text-gray-500 dark:text-gray-400">
                              {msg.id === "__pending_in"
                                ? "Nu"
                                : formatTime(msg.at)}
                            </p>
                          </div>
                          {buttons && (
                            <div className="flex flex-col border-t border-black/10 dark:border-white/10">
                              {buttons.map((btn) => (
                                <a
                                  key={btn.url}
                                  href={btn.url}
                                  className="border-t border-black/10 px-3 py-2.5 text-center text-sm font-medium text-[#00a884] first:border-t-0 hover:bg-black/5 dark:border-white/10 dark:text-emerald-300 dark:hover:bg-white/5"
                                >
                                  {btn.label}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                {isAwaitingReply && (
                  <div className="flex justify-start">
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-gray-500 shadow dark:bg-gray-800 dark:text-gray-400">
                      Assistent typt…
                    </div>
                  </div>
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
                <form onSubmit={handleSend} className="flex gap-2">
                  <input
                    ref={messageInputRef}
                    name="body"
                    type="text"
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    disabled={isSending}
                    placeholder="Typ een WhatsApp-bericht…"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !messageBody.trim()}
                    className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isSending ? "…" : "Verstuur"}
                  </button>
                </form>
                {(fetcher.data?.ok === false ||
                  replyFetcher.data?.ok === false) && (
                  <p className="mt-2 text-xs text-red-600">
                    Fout:{" "}
                    {fetcher.data?.ok === false
                      ? fetcher.data.error
                      : replyFetcher.data?.ok === false
                        ? replyFetcher.data.error
                        : "onbekend"}
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
  | { ok: true; intent: "send-tick"; trace: SendTickTrace }
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
        Cron taps
      </p>
      <fetcher.Form method="post" className="flex flex-col gap-1.5">
        <input
          type="datetime-local"
          name="at"
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-950"
          title="Optioneel: tijdreis naar deze instant. Leeg = nu."
        />
        <button
          type="submit"
          name="intent"
          value="cron-tick"
          disabled={isTicking}
          className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
        >
          {isTicking ? "Tikken…" : "⏱ Tick cascade"}
        </button>
        <button
          type="submit"
          name="intent"
          value="send-tick"
          disabled={isTicking}
          className="w-full rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200 dark:hover:bg-sky-900/50"
        >
          {isTicking ? "Tikken…" : "📨 Tick send-queue"}
        </button>
      </fetcher.Form>
      {data && data.ok === false && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{data.error}</p>
      )}
      {data && data.ok === true && data.intent === "cron-tick" && (
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
      {data && data.ok === true && data.intent === "send-tick" && (
        <div className="rounded-lg bg-gray-100 p-2 text-[10px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <p>
            {data.trace.queueEnabled ? (
              <>
                <strong>{data.trace.processed}</strong> message
                {data.trace.processed === 1 ? "" : "s"} gedraind
              </>
            ) : (
              <em>queue uit (INVITE_QUEUE_ENABLED=false)</em>
            )}
          </p>
          {data.trace.perMessage.length > 0 && (
            <ul className="mt-1 space-y-1">
              {data.trace.perMessage.map((entry) => (
                <li key={entry.msgId} className="break-all">
                  <code>{entry.inviteToken.slice(0, 8)}</code>: {entry.outcome.kind}{" "}
                  → {entry.action}
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

type SimulatorUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileName: string;
  waId: string;
  optedIn: boolean;
  activeFlow: string | null;
};

function userSearchLabel(user: SimulatorUser): string {
  return formatPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
    profileName: user.profileName,
    fallback: user.waId,
  });
}

function userSearchHaystack(user: SimulatorUser): string {
  return [
    user.firstName,
    user.lastName,
    user.profileName,
    user.waId,
    user.activeFlow,
    user.optedIn ? "opt-in" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function ResetUserForm({ userId }: { userId: string }) {
  return (
    <Form
      method="post"
      className="mt-2"
      onSubmit={(e) => {
        const ok = confirm(
          "Chatgeschiedenis, agentgeheugen, profiel en onboarding wissen? De gebruiker moet opnieuw met JA starten.",
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="reset-user" />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="w-full rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60"
      >
        Reset chat & onboarding
      </button>
    </Form>
  );
}

function UserSearchSelect({
  users,
  selectedUserId,
  onSelect,
}: {
  users: SimulatorUser[];
  selectedUserId: string;
  onSelect: (userId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedUser = users.find((u) => u.id === selectedUserId);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return users
      .filter((user) => userSearchHaystack(user).includes(q))
      .slice(0, 20);
  }, [query, users]);

  const showResults = query.trim().length >= 2;

  return (
    <div>
      <label
        htmlFor="user-search"
        className="block text-xs font-medium text-gray-700 dark:text-gray-300"
      >
        Gebruiker
      </label>
      {selectedUser && (
        <p className="mt-1.5 truncate text-xs text-gray-600 dark:text-gray-400">
          Actief:{" "}
          <span className="font-medium text-gray-900 dark:text-gray-200">
            {userSearchLabel(selectedUser)}
          </span>
        </p>
      )}
      <input
        id="user-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        placeholder="Zoek op naam of nummer…"
        className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-gray-700 dark:bg-gray-950"
      />
      {selectedUserId && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            onSelect("");
          }}
          className="mt-1 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Deselecteer
        </button>
      )}
      {showResults && (
        <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-950">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              Geen gebruikers voor "{query.trim()}".
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {matches.map((user) => {
                const isSelected = user.id === selectedUserId;
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(user.id);
                        setQuery("");
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        isSelected
                          ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200"
                          : ""
                      }`}
                    >
                      <span className="block truncate">
                        {userSearchLabel(user)}
                      </span>
                      <span className="block truncate text-[10px] text-gray-500 dark:text-gray-400">
                        {user.waId}
                        {user.optedIn ? " · opt-in" : ""}
                        {user.activeFlow ? ` · ${user.activeFlow}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
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
