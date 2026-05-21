import { redirect } from "react-router";
import {
  findDraftMatch,
  findUserByManageToken,
} from "~/lib/db.server";
import type { Match, User } from "~/types/domain";

/**
 * Resolve the (user, draft) pair for the manage token used by the new-match
 * wizard. Redirects to the welcome screen if there is no draft (e.g. user
 * deep-linked into a step without starting the flow).
 */
export async function requireDraftFor(
  token: string | undefined,
): Promise<{ user: User; draft: Match }> {
  const trimmed = token?.trim();
  if (!trimmed) throw new Response("Not Found", { status: 404 });
  const user = await findUserByManageToken(trimmed);
  if (!user) throw new Response("Not Found", { status: 404 });

  const draft = await findDraftMatch(user.id);
  if (!draft) {
    throw redirect(`/match/nieuw/${trimmed}`);
  }
  return { user, draft };
}
