import { Link } from "react-router";

type StepFooterProps = {
  primary: {
    type: "submit" | "button";
    label: string;
    busyLabel?: string;
    busy?: boolean;
    disabled?: boolean;
    form?: string;
    name?: string;
    value?: string;
    onClick?: () => void;
  };
  secondary?:
    | { kind: "link"; to: string; label: string }
    | { kind: "button"; label: string; onClick: () => void };
};

/**
 * Fixed full-width footer bar with a primary CTA and optional secondary link.
 * Renders at the bottom of the viewport; pages must reserve bottom padding
 * (the layout already adds pb-32 to <main>).
 */
export function StepFooter({ primary, secondary }: StepFooterProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="border-t border-border/60 bg-background/85 backdrop-blur-md">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:px-6">
          <button
            type={primary?.type}
            disabled={primary?.disabled || primary?.busy}
            form={primary?.form}
            name={primary?.name}
            value={primary?.value}
            onClick={primary?.onClick}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-glow transition hover:bg-accent/90 disabled:opacity-50"
          >
            {primary?.busy ? (primary?.busyLabel ?? "Bezig…") : primary?.label}
          </button>
          {secondary &&
            (secondary.kind === "link" ? (
              <Link
                to={secondary?.to}
                className="self-center text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                {secondary?.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={secondary?.onClick}
                className="self-center text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                {secondary?.label}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
