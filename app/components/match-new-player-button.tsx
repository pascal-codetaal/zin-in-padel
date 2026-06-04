import { Link } from "react-router";

export type MatchNewPlayerButtonProps = {
  href: string;
};

export function MatchNewPlayerButton({ href }: MatchNewPlayerButtonProps) {
  return (
    <Link
      to={href}
      className="inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-foreground transition hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      Nieuwe speler maken
    </Link>
  );
}
