import { redirect } from "react-router";
import type { Route } from "./+types/match.nieuw.$token.uitnodigingen";

export async function loader({ params }: Route.LoaderArgs) {
  return redirect(`/match/nieuw/${params.token}/uitnodigen`);
}

export async function action({ params }: Route.ActionArgs) {
  return redirect(`/match/nieuw/${params.token}/uitnodigen`);
}
