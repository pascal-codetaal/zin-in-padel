import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { findUserById } from "~/lib/db.server";
import {
  buildMaatjesPageUrl,
  buildProfielPageUrl,
} from "~/lib/vrienden-url.server";
import { resolveAppOrigin } from "~/lib/app-origin.server";
import {
  optInUser,
  optOutUser,
  setUserActiveFlow,
} from "~/lib/user-session.server";
import type { ActiveFlow } from "~/types/domain";

const activeFlowSchema = z.enum(["onboarding", "favorites", "match_creation"]);

function requireUserId(context: { requestContext?: { get(key: string): unknown } | null }) {
  const userId = context?.requestContext?.get("userId") as string | undefined;
  if (!userId) return { ok: false as const, error: "no_user_context" };
  return { ok: true as const, userId };
}

export const optInTool = createTool({
  id: "opt-in",
  description:
    "Meld de gebruiker aan (JA): zet optedIn=true, start onboarding, reset profiel. Gebruik bij JA of wanneer iemand zich wil registreren. Geeft profielPageUrl en maatjesPageUrl (vriendenpagina) terug om te delen.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    profielPageUrl: z.string().nullable().optional(),
    maatjesPageUrl: z.string().nullable().optional(),
    activeFlow: activeFlowSchema.optional(),
  }),
  execute: async (_input, context) => {
    const auth = requireUserId(context);
    if (!auth.ok) return auth;

    const user = await optInUser(auth.userId);
    const appOrigin = resolveAppOrigin(context);
    const request = new Request(`${appOrigin}/`);
    const profielPageUrl = buildProfielPageUrl(request, user.manageToken);
    const maatjesPageUrl = buildMaatjesPageUrl(request, user.manageToken);

    return {
      ok: true,
      profielPageUrl,
      maatjesPageUrl,
      activeFlow: user.activeFlow as "onboarding",
    };
  },
});

export const optOutTool = createTool({
  id: "opt-out",
  description:
    "Meld de gebruiker af (STOP): zet optedIn=false en wis profiel/onboarding. Gebruik bij STOP of expliciet afmelden.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async (_input, context) => {
    const auth = requireUserId(context);
    if (!auth.ok) return auth;

    await optOutUser(auth.userId);
    return { ok: true };
  },
});

export const setActiveFlowTool = createTool({
  id: "set-active-flow",
  description:
    "Zet de actieve WhatsApp-flow: onboarding, favorites (vrienden toevoegen), match_creation (match plannen), of null om te wissen.",
  inputSchema: z.object({
    flow: activeFlowSchema
      .nullable()
      .describe("null = flow afgesloten"),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    activeFlow: activeFlowSchema.nullable().optional(),
  }),
  execute: async ({ flow }, context) => {
    const auth = requireUserId(context);
    if (!auth.ok) return auth;

    const user = await findUserById(auth.userId);
    if (!user) return { ok: false, error: "user_not_found" };
    if (!user.optedIn && flow !== null) {
      return { ok: false, error: "opt_in_required" };
    }

    const updated = await setUserActiveFlow(
      auth.userId,
      flow as ActiveFlow,
    );
    return { ok: true, activeFlow: updated.activeFlow };
  },
});
