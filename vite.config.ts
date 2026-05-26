import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  ssr: {
    // Keep Prisma as runtime deps (generated via postinstall/build); avoids bundling issues on Vercel.
    external: [
      "@prisma/client",
      "@prisma/client-runtime-utils",
      "@prisma/adapter-pg",
    ],
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    allowedHosts: ["padelbot-dev.loca.lt"],
    // Public URL when tunneling — keeps asset URLs and SSR aligned with loca.lt.
    origin: process.env.VITE_DEV_ORIGIN ?? "https://padelbot-dev.loca.lt",
  },
});
