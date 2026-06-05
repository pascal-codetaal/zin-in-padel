export type GuestInviteActionsProps = {
  inviteUrl: string | null;
  inviteForwardText: string | null;
  playerRef: string;
  copiedRef: string | null;
  onCopy: (text: string, ref: string) => void;
  /** Row beside avatar; column stacks vertically in tight spaces. */
  layout?: "row" | "column";
};

export function GuestInviteActions({
  inviteUrl,
  inviteForwardText,
  playerRef,
  copiedRef,
  onCopy,
  layout = "row",
}: GuestInviteActionsProps) {
  if (!inviteUrl || !inviteForwardText) return null;

  const copied = copiedRef === playerRef;

  return (
    <div
      className={`flex shrink-0 items-center ${
        layout === "row" ? "flex-row gap-1" : "flex-col gap-1.5"
      }`}
    >
      <a
        href={inviteUrl}
        target="_blank"
        rel="noreferrer"
        title="Stuur via WhatsApp"
        aria-label="Stuur via WhatsApp"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm transition hover:bg-accent/90"
      >
        <MessageIcon className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        title={copied ? "Gekopieerd!" : "Kopieer bericht"}
        aria-label={copied ? "Gekopieerd!" : "Kopieer bericht"}
        onClick={() => onCopy(inviteForwardText, playerRef)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition hover:bg-secondary"
      >
        {copied ? (
          <CheckIcon className="h-3.5 w-3.5 text-accent" />
        ) : (
          <LinkIcon className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
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
      aria-hidden="true"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
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
      aria-hidden="true"
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
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
