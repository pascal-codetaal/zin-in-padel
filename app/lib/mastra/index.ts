import { Mastra } from "@mastra/core";
import { getMastraStorage } from "./memory.server";
import { padelAssistant } from "./agents/padelAssistant/agent.server";

export const mastra = new Mastra({
  storage: getMastraStorage(),
  agents: {
    padelAssistant,
  },
});
