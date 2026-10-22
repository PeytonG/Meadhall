// SPDX-License-Identifier: AGPL-3.0-only
// Starts or stops a throwaway Synapse in Docker for the integration and E2E tests.
// Usage: node scripts/test-synapse.mjs start|stop
// Env: SYNAPSE_PORT (default 8008), SYNAPSE_IMAGE (default pinned below),
//      SYNAPSE_ROOM_VERSION (default room version for new rooms; the server's own default if unset).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = process.env.SYNAPSE_IMAGE || "matrixdotorg/synapse:v1.163.0";
const CONTAINER = "meadhall-test-synapse";
const PORT = process.env.SYNAPSE_PORT || "8008";
const DATA_DIR = path.join(os.tmpdir(), CONTAINER);
const OVERRIDES_FILE = path.join(os.tmpdir(), `${CONTAINER}-overrides.yaml`);
const HEALTH_URL = `http://127.0.0.1:${PORT}/health`;
const STARTUP_TIMEOUT_MS = 120_000;

function docker(args, { allowFailure = false } = {}) {
    const result = spawnSync("docker", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0 && !allowFailure) {
        throw new Error(`docker ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
    }
    return result.stdout.trim();
}

function stop() {
    docker(["rm", "--force", CONTAINER], { allowFailure: true });
}

async function waitForHealth() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(HEALTH_URL);
            if (response.ok) {
                return;
            }
        } catch {
            // Not listening yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.error(docker(["logs", "--tail", "100", CONTAINER], { allowFailure: true }));
    throw new Error(`Synapse did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s`);
}

// On Linux the data dir ends up owned by the container's synapse user, so clear it from inside a container.
function clearDataDir() {
    if (fs.existsSync(DATA_DIR)) {
        docker(["run", "--rm", "--volume", `${DATA_DIR}:/data`, "--entrypoint", "sh", IMAGE, "-c", "rm -rf /data/* /data/.[!.]*"], {
            allowFailure: true,
        });
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function start() {
    stop();
    clearDataDir();

    docker([
        "run", "--rm",
        "--volume", `${DATA_DIR}:/data`,
        "--env", "SYNAPSE_SERVER_NAME=localhost",
        "--env", "SYNAPSE_REPORT_STATS=no",
        IMAGE, "generate",
    ]);
    let overrides = fs.readFileSync(path.join(__dirname, "test-synapse", "overrides.yaml"), "utf8");
    if (process.env.SYNAPSE_ROOM_VERSION) {
        overrides += `\ndefault_room_version: "${process.env.SYNAPSE_ROOM_VERSION}"\n`;
    }
    // Kept outside the data dir, which the runner can't write to once Synapse owns it.
    fs.writeFileSync(OVERRIDES_FILE, overrides);

    // Later --config-path files override earlier ones.
    docker([
        "run", "--detach",
        "--name", CONTAINER,
        "--publish", `127.0.0.1:${PORT}:8008`,
        "--volume", `${DATA_DIR}:/data`,
        "--volume", `${OVERRIDES_FILE}:/overrides.yaml:ro`,
        "--entrypoint", "python",
        IMAGE,
        "-m", "synapse.app.homeserver",
        "--config-path", "/data/homeserver.yaml",
        "--config-path", "/overrides.yaml",
    ]);
    await waitForHealth();
    const roomVersion = process.env.SYNAPSE_ROOM_VERSION ? `, room version ${process.env.SYNAPSE_ROOM_VERSION}` : "";
    console.log(`Synapse (${IMAGE}) is ready at http://localhost:${PORT} (server name "localhost"${roomVersion}).`);
}

const command = process.argv[2];
if (command === "start") {
    await start();
} else if (command === "stop") {
    stop();
    console.log("Synapse stopped.");
} else {
    console.error("Usage: node scripts/test-synapse.mjs start|stop");
    process.exit(2);
}
