import { searchPadelstatsMembers } from "~/lib/padelstats-catalog.server";
import {
  MEMBER_SEARCH_LIMIT,
  MEMBER_SEARCH_MIN_QUERY_LENGTH,
} from "~/lib/padelstats-member-search.shared";
import type { Route } from "./+types/api.padelstats.members.search";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

async function memberSearchResponse(q: string) {
  if (q.length < MEMBER_SEARCH_MIN_QUERY_LENGTH) {
    return Response.json(
      { members: [], limit: MEMBER_SEARCH_LIMIT },
      { headers: NO_STORE_HEADERS },
    );
  }

  try {
    const members = await searchPadelstatsMembers(q, MEMBER_SEARCH_LIMIT);
    return Response.json(
      { members, limit: MEMBER_SEARCH_LIMIT },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    console.error("[padelstats-member-search]", err);
    return Response.json(
      { members: [], error: "search_failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  return memberSearchResponse(q);
}

export async function action({ request }: Route.ActionArgs) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { q?: unknown };
      const q = typeof body.q === "string" ? body.q.trim() : "";
      return memberSearchResponse(q);
    }

    const form = await request.formData();
    const q = form.get("q")?.toString().trim() ?? "";
    return memberSearchResponse(q);
  } catch {
    return Response.json(
      { members: [], error: "bad_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
