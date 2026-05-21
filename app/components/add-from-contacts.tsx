import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

type PickedContact = { name: string; phone: string };

type ContactPickerResult = {
  name?: string[];
  tel?: string[];
};

function mapPickedContact(contact: ContactPickerResult): PickedContact | null {
  const phone = contact.tel?.find((t) => t.trim().length > 0);
  if (!phone) return null;
  const name = contact.name?.[0]?.trim() || phone;
  return { name, phone };
}

export function AddFromContacts({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const fetcher = useFetcher();
  const [contactsSupported, setContactsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContactsSupported(
      typeof navigator !== "undefined" && "contacts" in navigator,
    );
  }, []);

  const isBusy = disabled || fetcher.state !== "idle";

  async function pickContacts() {
    setError(null);
    if (!contactsSupported || !navigator.contacts) {
      setError("Contacten kiezen wordt niet ondersteund in deze browser.");
      return;
    }

    try {
      const picked = await navigator.contacts.select(["name", "tel"], {
        multiple: true,
      });
      const contacts = picked
        .map(mapPickedContact)
        .filter((c): c is PickedContact => c !== null);

      if (contacts.length === 0) {
        setError("Geen contacten met een telefoonnummer geselecteerd.");
        return;
      }

      const formData = new FormData();
      formData.set("intent", "add-batch");
      formData.set("contacts", JSON.stringify(contacts));
      fetcher.submit(formData, { method: "post" });
    } catch (err) {
      if (err instanceof Error && err.name === "InvalidStateError") {
        setError("Contacten kiezen werkt alleen via HTTPS op je telefoon.");
        return;
      }
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError("Kon contacten niet openen. Probeer handmatig toe te voegen.");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={pickContacts}
        disabled={isBusy || !contactsSupported}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-background text-sm font-medium transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ContactBookIcon className="h-4 w-4" />
        {fetcher.state !== "idle" ? "Bezig…" : "Kies uit contacten"}
      </button>
      {!contactsSupported && (
        <p className="text-xs text-muted-foreground">
          Contacten kiezen werkt in Chrome op Android. Voeg anders handmatig toe.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ContactBookIcon({ className }: { className?: string }) {
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
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <rect width="16" height="18" x="4" y="4" rx="2" />
      <path d="M12 11h4" />
      <path d="M12 15h4" />
      <path d="M8 11h.01" />
      <path d="M8 15h.01" />
    </svg>
  );
}
