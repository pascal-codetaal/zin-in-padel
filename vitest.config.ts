import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
      "@whatsapp-templates": path.resolve(__dirname, "./whatsapp-templates"),
    },
  },
  test: {
    include: ["app/**/*.test.ts", "whatsapp-templates/**/*.test.ts"],
    environment: "node",
  },
});
