import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getClubsByIds, searchClubs } from "~/lib/clubs.server";
import {
  addFriend,
  stageFriendName,
} from "~/lib/friends.server";
import {
  findUserById,
  getDatabase,
  updateUserProfile,
} from "~/lib/db.server";

export const readProfileTool = createTool({
  id: "read-profile",
  description:
    "Lees het profiel van de actieve gebruiker: niveau, vrienden, clubvoorkeuren (opgeslagen clubs), matchvoorkeur, openstaande vriend-aanvraag. Gebruik search-clubs om clubs te zoeken.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    currentUser: z
      .object({
        id: z.string(),
        profileName: z.string(),
        phone: z.string(),
        level: z.number().nullable(),
        favoritePlayerRefs: z.array(z.string()),
        preferredClubIds: z.array(z.string()),
        matchPreference: z
          .enum(["friends_only", "level_only", "open"])
          .nullable(),
        onboardingComplete: z.boolean(),
        pendingFriend: z.object({ name: z.string() }).nullable(),
      })
      .nullable(),
    favoritePlayers: z.array(
      z.object({
        ref: z.string(),
        name: z.string(),
        phone: z.string(),
      }),
    ),
    preferredClubs: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        province: z.string().optional(),
      }),
    ),
  }),
  execute: async (_input, context) => {
    const userId = context?.requestContext?.get("userId") as
      | string
      | undefined;
    const db = await getDatabase();
    const user = userId ? db.users.find((u) => u.id === userId) : null;
    const favoritePlayers = user
      ? db.players
          .filter((p) => user.favoritePlayerRefs.includes(p.ref))
          .map((p) => ({
            ref: p.ref,
            name: p.name,
            phone: p.phone,
          }))
      : [];
    const preferredClubs = user
      ? await getClubsByIds(user.preferredClubIds)
      : [];

    return {
      currentUser: user
        ? {
            id: user.id,
            profileName: user.profileName,
            phone: user.phone,
            level: user.level,
            favoritePlayerRefs: user.favoritePlayerRefs,
            preferredClubIds: user.preferredClubIds,
            matchPreference: user.matchPreference,
            onboardingComplete: user.onboardingComplete,
            pendingFriend: user.pendingFriend,
          }
        : null,
      favoritePlayers,
      preferredClubs,
    };
  },
});

export const searchClubsTool = createTool({
  id: "search-clubs",
  description:
    "Zoek padelclubs in Vlaanderen op naam, gemeente of provincie. Gebruik de club-id uit de resultaten voor update-profile preferredClubIds.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Zoekterm, bv. 'Gent', 'Padel Arena', 'Antwerpen'"),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    count: z.number(),
    clubs: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        province: z.string().optional(),
      }),
    ),
    message: z.string().optional(),
  }),
  execute: async ({ query }) => {
    const clubs = await searchClubs(query);
    if (clubs.length === 0) {
      return {
        ok: true,
        count: 0,
        clubs: [],
        message: `Geen clubs gevonden voor "${query}". Probeer een andere spelling of alleen de gemeente.`,
      };
    }
    return {
      ok: true,
      count: clubs.length,
      clubs,
      message:
        clubs.length >= 15
          ? "Meer dan 15 treffers; toon de beste 15. Verfijn de zoekterm indien nodig."
          : undefined,
    };
  },
});

export const addFriendTool = createTool({
  id: "add-friend",
  description:
    "Voeg een vriend toe. Vereist naam en mobiel nummer. Als alleen een naam gegeven is, vraag om het nummer (of gebruik nameOnly).",
  inputSchema: z.object({
    name: z.string().min(1).describe("Naam van de vriend"),
    phone: z
      .string()
      .optional()
      .describe("Mobiel nummer; verplicht om toe te voegen"),
    nameOnly: z
      .boolean()
      .optional()
      .describe("Alleen naam gegeven — start wachten op telefoonnummer"),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z.enum(["added", "pending_phone", "error"]).optional(),
    message: z.string().optional(),
    playerName: z.string().optional(),
    phone: z.string().optional(),
    alreadyFavorite: z.boolean().optional(),
  }),
  execute: async ({ name, phone, nameOnly }, context) => {
    const userId = context?.requestContext?.get("userId") as
      | string
      | undefined;
    if (!userId) {
      return { ok: false, status: "error" as const, message: "no_user_context" };
    }

    const user = await findUserById(userId);
    if (!user) {
      return { ok: false, status: "error" as const, message: "user_not_found" };
    }

    if (user.pendingFriend && !phone) {
      return {
        ok: false,
        status: "error" as const,
        message: `Er wacht al een nummer voor ${user.pendingFriend.name}. Laat de gebruiker het nummer sturen.`,
      };
    }

    if (!phone || nameOnly) {
      const staged = await stageFriendName(userId, name);
      return {
        ok: true,
        status: "pending_phone" as const,
        message: staged.message,
        playerName: name.trim(),
      };
    }

    const result = await addFriend(userId, name, phone);
    if (!result.ok) {
      return {
        ok: false,
        status: "error" as const,
        message: "Ongeldig mobiel nummer.",
      };
    }

    return {
      ok: true,
      status: "added" as const,
      playerName: result.name,
      phone: result.phone,
      alreadyFavorite: result.alreadyFavorite,
      message: result.alreadyFavorite
        ? `${result.name} (${result.phone}) stond al in je vriendenlijst.`
        : `${result.name} toegevoegd (${result.phone}).`,
    };
  },
});

export const updateProfileTool = createTool({
  id: "update-profile",
  description:
    "Werk profielvelden bij: padelniveau (1-7), clubvoorkeuren (club-ids uit search-clubs), matchvoorkeur. Zet onboardingComplete true wanneer het profiel klaar is.",
  inputSchema: z.object({
    level: z.number().int().min(1).max(7).optional(),
    preferredClubIds: z.array(z.string()).optional(),
    matchPreference: z.enum(["friends_only", "level_only", "open"]).optional(),
    onboardingComplete: z.boolean().optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    user: z
      .object({
        level: z.number().nullable(),
        preferredClubIds: z.array(z.string()),
        matchPreference: z
          .enum(["friends_only", "level_only", "open"])
          .nullable(),
        onboardingComplete: z.boolean(),
      })
      .optional(),
  }),
  execute: async (input, context) => {
    const userId = context?.requestContext?.get("userId") as
      | string
      | undefined;
    if (!userId) {
      return { ok: false, error: "no_user_context" };
    }

    if (input.onboardingComplete) {
      const user = await findUserById(userId);
      const db = await getDatabase();
      const favorites = db.players.filter((p) =>
        user?.favoritePlayerRefs.includes(p.ref),
      );
      if (favorites.some((p) => !p.phone?.trim())) {
        return { ok: false, error: "favorites_missing_phone" };
      }
    }

    try {
      const user = await updateUserProfile(userId, input);
      return {
        ok: true,
        user: {
          level: user.level,
          preferredClubIds: user.preferredClubIds,
          matchPreference: user.matchPreference,
          onboardingComplete: user.onboardingComplete,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "update_failed",
      };
    }
  },
});

export const readDbTool = readProfileTool;
export const addFavoriteTool = addFriendTool;
