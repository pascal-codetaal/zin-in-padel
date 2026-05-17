import { Mastra } from "@mastra/core";
import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { getMastraStorage } from "./memory.server";
import { favoritesAgent } from "./agents/favoritePlayers/agent.server";

export const mastra = new Mastra({
  storage: getMastraStorage(),
  agents: {
    favoritesAgent,
  },
  server: {
    middleware: [
      async (c, next) => {
        const requestContext = c.get("requestContext");
        const userId = requestContext?.get("userId");
        if (typeof userId === "string" && userId.length > 0) {
          requestContext.set(MASTRA_RESOURCE_ID_KEY, userId);
        }
        await next();
      },
    ],
  },
});
