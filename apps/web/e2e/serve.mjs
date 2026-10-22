// Serves the production build for the E2E tests, pointed at the test Synapse.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const synapseUrl = process.env.SYNAPSE_URL ?? "http://localhost:8008";

// config.<hostname>.json takes precedence over config.json, so a developer's own config.json is never touched.
fs.writeFileSync(
    path.join(webRoot, "dist", "config.127.0.0.1.json"),
    JSON.stringify(
        {
            default_server_config: { "m.homeserver": { base_url: synapseUrl, server_name: "localhost" } },
            voice_enabled: false,
        },
        null,
        2,
    ),
);

const vite = spawn(
    process.execPath,
    [path.join(webRoot, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
    { cwd: webRoot, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => vite.kill(signal));
}
vite.on("exit", (code) => process.exit(code ?? 0));
