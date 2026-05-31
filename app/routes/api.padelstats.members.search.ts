import { searchPadelstatsMembers } from "~/lib/padelstats-catalog.server";
import {
  MEMBER_SEARCH_LIMIT,
  MEMBER_SEARCH_MIN_QUERY_LENGTH,
} from "~/lib/padelstats-member-search.shared";
import type { Route } from "./+types/api.padelstats.members.search";

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (q.length < MEMBER_SEARCH_MIN_QUERY_LENGTH) {
    return Response.json({ members: [], limit: MEMBER_SEARCH_LIMIT });
  }

  try {
    const members = await searchPadelstatsMembers(q, MEMBER_SEARCH_LIMIT);
    return Response.json({ members, limit: MEMBER_SEARCH_LIMIT });
  } catch (err) {
    console.error("[padelstats-member-search]", err);
    return Response.json(
      { members: [], error: "search_failed" },
      { status: 500 },
    );
  }
}
