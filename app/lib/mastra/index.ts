import { Mastra } from "@mastra/core";
import { createFavoritesAgent } from "./agent.server";

// Studio-facing Mastra instance. The agent is parameterized by userId in
// production (see whatsapp-bot.server.ts); for Studio prompt iteration we
// register one instance with a placeholder userId.
export const mastra = new Mastra({
  agents: {
    favoritesAgent: createFavoritesAgent("studio-placeholder-user"),
  },
});
