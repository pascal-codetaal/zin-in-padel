import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    allowedHosts: ["padelbot-dev.loca.lt"],
    // Public URL when tunneling — keeps asset URLs and SSR aligned with loca.lt.
    origin: process.env.VITE_DEV_ORIGIN ?? "https://padelbot-dev.loca.lt",
  },
});
