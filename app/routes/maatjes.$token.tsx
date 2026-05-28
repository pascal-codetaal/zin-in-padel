import { useState } from "react";
import {
  data,
  Form,
  Link,
  redirect,
  useNavigation,
} from "react-router";
import { AddFromContacts } from "~/components/add-from-contacts";
import type { Route } from "./+types/maatjes.$token";
import {
  findUserByManageToken,
  removeFavoriteFromUser,
} from "~/lib/db.server";
import { addFriend } from "~/lib/friends.server";
import {
  getFavoritePlayersForUser,
  type FavoritePlayerView,
} from "~/lib/favorites-page.server";
import { formatPersonName } from "~/lib/person-name";

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData
    ? formatPersonName({
        firstName: loaderData.user.firstName,
        lastName: loaderData.user.lastName,
        profileName: loaderData.user.profileName,
      })
    : undefined;
  return [
    {
      title: name
        ? `Maatjes van ${name} — PadelMatch`
        : "Mijn maatjes — PadelMatch",
    },
    {
      name: "description",
      content: "Beheer je voorkeursspelers en nodig ze uit via WhatsApp",
    },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = params.token?.trim();
  if (!token) {
    throw data("Not Found", { status: 404 });
  }

  const user = await findUserByManageToken(token);
  if (!user) {
    throw data("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const addedParam = url.searchParams.get("added");
  const skippedParam = url.searchParams.get("skipped");
  const batchAdded =
    addedParam !== null ? Number.parseInt(addedParam, 10) : null;
  const batchSkipped =
    skippedParam !== null ? Number.parseInt(skippedParam, 10) : null;

  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM;
  const favorites = await getFavoritePlayersForUser(user.id, twilioFrom);

  return {
    token,
    user: {
      id: user.id,
      profileName: user.profileName,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    players: favorites.ok ? favorites.players : [],
    inviteConfigured: Boolean(twilioFrom),
    batchFeedback:
      batchAdded !== null && !Number.isNaN(batchAdded)
        ? { added: batchAdded, skipped: batchSkipped ?? 0 }
        : null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token?.trim();
  if (!token) {
    return { ok: false as const, error: "missing_token" };
  }

  const user = await findUserByManageToken(token);
  if (!user) {
    return { ok: false as const, error: "user_not_found" };
  }

  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  if (intent === "add") {
    const name = form.get("name")?.toString() ?? "";
    const phone = form.get("phone")?.toString() ?? "";

    if (!name.trim()) {
      return { ok: false as const, error: "name_required" };
    }

    const result = await addFriend(user.id, name, phone);
    if (!result.ok) {
      return {
        ok: false as const,
        error: result.error === "invalid_phone" ? "invalid_phone" : "unknown",
      };
    }

    return redirect(`/maatjes/${token}`);
  }

  if (intent === "add-batch") {
    const raw = form.get("contacts")?.toString() ?? "[]";
    let contacts: { name: string; phone: string }[];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return { ok: false as const, error: "invalid_batch" };
      }
      contacts = parsed.filter(
        (c): c is { name: string; phone: string } =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as { name?: unknown }).name === "string" &&
          typeof (c as { phone?: unknown }).phone === "string",
      );
    } catch {
      return { ok: false as const, error: "invalid_batch" };
    }

    if (contacts.length === 0) {
      return { ok: false as const, error: "empty_batch" };
    }

    let added = 0;
    let skipped = 0;
    for (const contact of contacts) {
      const result = await addFriend(user.id, contact.name, contact.phone);
      if (result.ok) added += 1;
      else skipped += 1;
    }

    const params = new URLSearchParams({ added: String(added) });
    if (skipped > 0) params.set("skipped", String(skipped));
    return redirect(`/maatjes/${token}?${params.toString()}`);
  }

  if (intent === "remove") {
    const ref = form.get("ref")?.toString();
    if (!ref) return { ok: false as const, error: "missing_ref" };
    await removeFavoriteFromUser(user.id, ref);
    return redirect(`/maatjes/${token}`);
  }

  return { ok: false as const, error: "unknown_intent" };
}

function formatPhone(phone: string) {
  return phone.replace(
    /(\+\d{2})(\d{3})(\d{2})(\d{2})(\d{2})/,
    "$1 $2 $3 $4 $5",
  );
}

export default function MaatjesPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    token,
    user,
    players,
    inviteConfigured,
    batchFeedback,
  } = loaderData;
  const navigation = useNavigation();
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  const isSubmitting = navigation.state !== "idle";

  async function copyInvite(text: string, ref: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRef(ref);
      window.setTimeout(() => setCopiedRef(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-lg font-bold"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-primary-foreground shadow-glow">
              <MessageIcon className="h-4 w-4" />
            </span>
            PadelMatch
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to={`/match/${token}`}
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              Matches
            </Link>
            <Link
              to={`/match/nieuw/${token}`}
              className="text-sm font-medium text-accent-foreground transition hover:text-foreground"
            >
              + Match
            </Link>
            <Link
              to={`/profiel/${token}`}
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              Profiel →
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-6 py-10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-radial" />

        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Voorkeursspelers
          </p>
          <h1 className="mt-2 text-4xl font-bold text-balance">
            Jouw{" "}
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              padelmaatjes
            </span>
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Voeg spelers toe die je het liefst uitnodigt. Nog geen gebruiker van
            Zin in Padel? Stuur ze zelf een bericht via WhatsApp — dat voelt
            persoonlijker dan een automatische uitnodiging van ons.
          </p>

          {batchFeedback && (
            <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground">
              {batchFeedback.added === 1
                ? "1 contact toegevoegd."
                : `${batchFeedback.added} contacten toegevoegd.`}
              {batchFeedback.skipped > 0 &&
                ` ${batchFeedback.skipped} overgeslagen (ongeldig nummer of al in je lijst).`}
            </p>
          )}

          <section className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Contact toevoegen</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Kies iemand uit je telefoonboek of vul naam en nummer handmatig in.
            </p>

            <div className="mt-4">
              <AddFromContacts disabled={isSubmitting} />
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">of</span>
              </div>
            </div>

            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="add" />
              <input
                name="name"
                type="text"
                required
                placeholder="Naam"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                name="phone"
                type="tel"
                required
                placeholder="Mobiel nummer"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {actionData?.ok === false &&
                actionData.error === "invalid_phone" && (
                  <p className="text-sm text-destructive">
                    Geen geldig mobiel nummer. Probeer bv. 0470123456.
                  </p>
                )}
              {actionData?.ok === false &&
                actionData.error === "name_required" && (
                  <p className="text-sm text-destructive">Vul een naam in.</p>
                )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground shadow-glow transition hover:bg-accent/90 disabled:opacity-50"
              >
                {isSubmitting ? "Bezig…" : "Toevoegen"}
              </button>
            </Form>
          </section>

          <section className="relative mt-8">
            <h2 className="text-lg font-semibold">
              Jouw lijst ({players.length})
            </h2>
            {!inviteConfigured && (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Stel <code className="text-xs">TWILIO_WHATSAPP_FROM</code> in om
                uitnodigingslinks te genereren.
              </p>
            )}

            {players.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-border bg-secondary/40 px-6 py-12 text-center">
                <UsersIcon className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-muted-foreground">
                  Nog geen maatjes. Voeg je eerste speler hierboven toe.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {players.map((player) => (
                  <PlayerCard
                    key={player.ref}
                    player={player}
                    token={token}
                    isSubmitting={isSubmitting}
                    copiedRef={copiedRef}
                    onCopyInvite={copyInvite}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function PlayerCard({
  player,
  token,
  isSubmitting,
  copiedRef,
  onCopyInvite,
}: {
  player: FavoritePlayerView;
  token: string;
  isSubmitting: boolean;
  copiedRef: string | null;
  onCopyInvite: (text: string, ref: string) => void;
}) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{player.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatPhone(player.phone) || player.phone}
          </p>
        </div>
        <UserStatusBadge
          isAppUser={player.isAppUser}
          optedIn={player.optedIn}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {player.inviteUrl && player.inviteForwardText ? (
          <>
            <a
              href={player.inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <MessageIcon className="h-3.5 w-3.5" />
              Stuur via WhatsApp
            </a>
            <button
              type="button"
              onClick={() =>
                onCopyInvite(player.inviteForwardText!, player.ref)
              }
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium transition hover:bg-secondary"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              {copiedRef === player.ref ? "Gekopieerd!" : "Kopieer bericht"}
            </button>
          </>
        ) : player.isAppUser && player.optedIn ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckIcon className="h-4 w-4 text-accent" />
            Actief op PadelMatch
          </span>
        ) : null}

        <Form method="post" className="ml-auto">
          <input type="hidden" name="intent" value="remove" />
          <input type="hidden" name="ref" value={player.ref} />
          <button
            type="submit"
            disabled={isSubmitting}
            className="text-sm text-muted-foreground transition hover:text-destructive"
          >
            Verwijderen
          </button>
        </Form>
      </div>

      {player.inviteUrl && player.inviteForwardText && (
        <p className="mt-3 text-xs text-muted-foreground">
          Je opent een chat met {player.name}. Het bericht staat klaar — controleer
          het en tik op Verzenden. Zo komt de uitnodiging van jou, niet van ons
          systeem.
        </p>
      )}
    </li>
  );
}

function UserStatusBadge({
  isAppUser,
  optedIn,
}: {
  isAppUser: boolean;
  optedIn: boolean;
}) {
  if (optedIn) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-1 text-xs font-medium text-accent-foreground">
        <CheckIcon className="h-3 w-3" />
        Gebruiker
      </span>
    );
  }
  if (isAppUser) {
    return (
      <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
        Nog geen opt-in
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      Nog geen gebruiker
    </span>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
