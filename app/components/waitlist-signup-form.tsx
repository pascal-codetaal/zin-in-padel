import { useState } from "react";
import { Form } from "react-router";
import { PadelstatsMemberAutocomplete } from "~/components/padelstats-member-autocomplete";
import type { PadelstatsMemberHit } from "~/lib/padelstats-catalog.types";
import {
  WAITLIST_ERROR_MESSAGES,
  type WaitlistFormError,
} from "~/lib/waitlist-form.shared";

type Props = {
  error?: WaitlistFormError;
  submitted?: boolean;
  updated?: boolean;
  compact?: boolean;
};

export function WaitlistSignupForm({
  error,
  submitted,
  updated,
  compact = false,
}: Props) {
  const [selectedMember, setSelectedMember] =
    useState<PadelstatsMemberHit | null>(null);

  if (submitted) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 shadow-soft md:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/20 text-2xl">
          ✓
        </div>
        <h2 className="mt-4 text-2xl font-bold">Je staat op de lijst!</h2>
        <p className="mt-2 text-muted-foreground">
          {updated
            ? "We hebben je gegevens bijgewerkt. "
            : "Bedankt voor je vertrouwen. "}
          We nemen contact op via WhatsApp zodra we genoeg spelers hebben.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <header className={compact ? "mb-4" : "mb-6"}>
        <h2
          className={
            compact
              ? "text-xl font-bold text-balance"
              : "text-2xl font-bold text-balance"
          }
        >
          Inschrijven
        </h2>
        {!compact && (
          <p className="mt-2 text-sm text-muted-foreground">
            Zoek je naam en laat je WhatsApp-nummer achter.
          </p>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {WAITLIST_ERROR_MESSAGES[error]}
        </p>
      )}

      <Form method="post" className="space-y-5">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
          aria-hidden
        />

        <PadelstatsMemberAutocomplete
          selected={selectedMember}
          onSelect={setSelectedMember}
        />

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Mobiel nummer</span>
          <input
            type="tel"
            name="phone"
            required
            autoComplete="tel"
            inputMode="tel"
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
            placeholder="0470 12 34 56"
          />
        </label>

        <label className="flex cursor-pointer gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-1 h-4 w-4 rounded border-input"
          />
          <span className="text-muted-foreground">
            Ik geef toestemming om mijn gegevens te bewaren voor de wachtlijst
            en om me te contacteren over de lancering.
          </span>
        </label>

        <button
          type="submit"
          disabled={!selectedMember}
          className="w-full rounded-full bg-accent px-6 py-3.5 text-base font-semibold text-accent-foreground shadow-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          Inschrijven
        </button>
      </Form>
    </div>
  );
}
