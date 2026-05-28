import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

function resolveServerEntry() {
  const direct = join("build", "server", "index.js");
  if (existsSync(direct)) return direct;

  const serverDir = join("build", "server");
  if (!existsSync(serverDir)) {
    throw new Error("Missing build/server directory. Did you run the build?");
  }

  const entries = readdirSync(serverDir)
    .map((name) => join(serverDir, name))
    .filter((path) => statSync(path).isDirectory())
    .map((dir) => join(dir, "index.js"))
    .filter((path) => existsSync(path));

  if (entries.length === 0) {
    throw new Error(
      "Could not find server entrypoint. Expected build/server/index.js or build/server/*/index.js",
    );
  }

  return entries[0];
}

const entry = resolveServerEntry();
const child = spawn("pnpm", ["exec", "react-router-serve", entry], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
