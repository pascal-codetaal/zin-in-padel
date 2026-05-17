import { Mastra } from "@mastra/core";
import { getMastraStorage } from "./memory.server";
import { favoritesAgent } from "./agent.server";

// Single Mastra instance. Storage is configured here; the Memory attached to
// the agent has no own storage and inherits this one at resolve time
// (Agent.getMemory -> Memory.setStorage(mastra.getStorage()) when !hasOwnStorage).
//
// One agent, no per-user factory. Per-request data (userId) flows in via
// `requestContext` on each agent.generate() call.
export const mastra = new Mastra({
  storage: getMastraStorage(),
  agents: {
    favoritesAgent,
  },
});
