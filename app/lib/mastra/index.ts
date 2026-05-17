import { Mastra } from "@mastra/core";
import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { getMastraStorage } from "./memory.server";
import { favoritesAgent } from "./agents/favoritePlayers/agent.server";

// Single Mastra instance. Storage is configured here; the Memory attached to
// the agent has no own storage and inherits this one at resolve time
// (Agent.getMemory -> Memory.setStorage(mastra.getStorage()) when !hasOwnStorage).
//
// One agent, no per-user factory. Per-request data (userId) flows in via
// `requestContext` on each agent.generate() call.
//
// Server middleware bridges Studio's request-context preset (`userId`) to the
// reserved MASTRA_RESOURCE_ID_KEY so memory queries scope to the chosen user.
// Without this, Studio uses an auto-generated UUID resourceId and never sees
// the threads created from the WhatsApp path.
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
