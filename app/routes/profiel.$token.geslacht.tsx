import { redirect } from "react-router";
import type { Route } from "./+types/profiel.$token.geslacht";

export function loader({ params }: Route.LoaderArgs) {
  const token = params.token?.trim();
  if (!token) throw new Response(null, { status: 404 });
  throw redirect(`/profiel/${token}/basis`);
}

export default function GeslachtRedirect() {
  return null;
}
