import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  addFavoriteToUser,
  findUserById,
  getDatabase,
  upsertPlayer,
} from "../db.server";

export const readDbTool = createTool({
  id: "read-db",
  description:
    "Lees de huidige database: de actieve gebruiker, hun favoriete spelers (Player records) en alle bestaande spelers. Gebruik dit om te checken of een speler al bestaat of welke favorieten de gebruiker al heeft.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    currentUser: z
      .object({
        id: z.string(),
        profileName: z.string(),
        phone: z.string(),
        favoritePlayerPhones: z.array(z.string()),
      })
      .nullable(),
    favoritePlayers: z.array(
      z.object({ phone: z.string(), name: z.string() }),
    ),
    allPlayers: z.array(z.object({ phone: z.string(), name: z.string() })),
  }),
  execute: async (_input, context) => {
    const userId = context?.requestContext?.get("userId") as
      | string
      | undefined;
    const db = await getDatabase();
    const user = userId ? db.users.find((u) => u.id === userId) : null;
    const favoritePlayers = user
      ? db.players.filter((p) => user.favoritePlayerPhones.includes(p.phone))
      : [];
    return {
      currentUser: user
        ? {
            id: user.id,
            profileName: user.profileName,
            phone: user.phone,
            favoritePlayerPhones: user.favoritePlayerPhones,
          }
        : null,
      favoritePlayers,
      allPlayers: db.players,
    };
  },
});

export const addFavoriteTool = createTool({
  id: "add-favorite",
  description:
    "Voeg een favoriete speler toe voor de actieve gebruiker. Phone is de unieke sleutel; gebruik de naam zoals de gebruiker hem aangeeft.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Naam van de speler"),
    phone: z.string().min(1).describe("Mobiel nummer van de speler"),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    player: z.object({ phone: z.string(), name: z.string() }).optional(),
    alreadyFavorite: z.boolean().optional(),
  }),
  execute: async ({ name, phone }, context) => {
    const userId = context?.requestContext?.get("userId") as
      | string
      | undefined;
    if (!userId) {
      return { ok: false, error: "no_user_context" };
    }
    const user = await findUserById(userId);
    if (!user) {
      return { ok: false, error: "user_not_found" };
    }
    const alreadyFavorite = user.favoritePlayerPhones.includes(phone);
    const player = await upsertPlayer({ phone, name });
    await addFavoriteToUser(userId, phone);
    return { ok: true, player, alreadyFavorite };
  },
});
