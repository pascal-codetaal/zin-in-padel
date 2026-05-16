import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  addFavoriteToUser,
  findUserById,
  getDatabase,
  isE164,
  upsertPlayer,
} from "../db.server";

export function createFavoritesTools(userId: string) {
  const readDb = createTool({
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
    execute: async () => {
      const db = await getDatabase();
      const user = db.users.find((u) => u.id === userId);
      const favoritePlayers = user
        ? db.players.filter((p) =>
            user.favoritePlayerPhones.includes(p.phone),
          )
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

  const addFavorite = createTool({
    id: "add-favorite",
    description:
      "Voeg een favoriete speler toe voor de actieve gebruiker. Phone MOET in strikt E.164 formaat zijn (bijv. +31612345678). Bij niet-E.164 input wordt er een error teruggegeven en moet je de gebruiker vragen het nummer opnieuw te geven in +31... formaat.",
    inputSchema: z.object({
      name: z.string().min(1).describe("Naam van de speler"),
      phone: z
        .string()
        .describe("Mobiel nummer in strikt E.164 formaat, bijv. +31612345678"),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
      player: z
        .object({ phone: z.string(), name: z.string() })
        .optional(),
      alreadyFavorite: z.boolean().optional(),
    }),
    execute: async ({ name, phone }) => {
      if (!isE164(phone)) {
        return {
          ok: false,
          error: "phone_not_e164",
        };
      }
      const user = await findUserById(userId);
      if (!user) {
        return { ok: false, error: "user_not_found" };
      }
      const alreadyFavorite = user.favoritePlayerPhones.includes(phone);
      const player = await upsertPlayer({ phone, name });
      await addFavoriteToUser(userId, phone);
      return {
        ok: true,
        player,
        alreadyFavorite,
      };
    },
  });

  return { readDb, addFavorite };
}
