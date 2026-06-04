import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
  experimental: {
    externalTables: true,
  },
  tables: {
    external: [
      "public.mastra_agent_versions",
      "public.mastra_agents",
      "public.mastra_ai_spans",
      "public.mastra_background_tasks",
      "public.mastra_channel_config",
      "public.mastra_channel_installations",
      "public.mastra_dataset_items",
      "public.mastra_dataset_versions",
      "public.mastra_datasets",
      "public.mastra_experiment_results",
      "public.mastra_experiments",
      "public.mastra_favorites",
      "public.mastra_mcp_client_versions",
      "public.mastra_mcp_clients",
      "public.mastra_mcp_server_versions",
      "public.mastra_mcp_servers",
      "public.mastra_messages",
      "public.mastra_observational_memory",
      "public.mastra_prompt_block_versions",
      "public.mastra_prompt_blocks",
      "public.mastra_resources",
      "public.mastra_schedule_triggers",
      "public.mastra_schedules",
      "public.mastra_scorer_definition_versions",
      "public.mastra_scorer_definitions",
      "public.mastra_scorers",
      "public.mastra_skill_blobs",
      "public.mastra_skill_versions",
      "public.mastra_skills",
      "public.mastra_threads",
      "public.mastra_workflow_snapshot",
      "public.mastra_workspace_versions",
      "public.mastra_workspaces",
    ],
  },
});
