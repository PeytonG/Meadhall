// SPDX-License-Identifier: AGPL-3.0-only
// Starts or stops a throwaway LiveKit server in Docker for the call tests (e2e/calls-live), next to the test Synapse.
// Dev keys, local ports only: never use this setup for anything real.
// Usage: node scripts/test-livekit.mjs start|stop
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const IMAGE = process.env.LIVEKIT_IMAGE || "livekit/livekit-server:v1.9.1";
const CONTAINER = "meadhall-test-livekit";
// Must match e2e/support/lkTokenService.mjs.
export const LIVEKIT_KEY = "meadhall-test-key";
export const LIVEKIT_SECRET = "meadhall-test-secret-that-is-at-least-32-chars";

function docker(args, { allowFailure = false } = {}) {
    const result = spawnSync("docker", args, { encoding: "utf8" });
    if (result.status !== 0 && !allowFailure) {
        throw new Error(`docker ${args.join(" ")} failed:\n${result.stderr}`);
    }
    return result.stdout.trim();
}

async function waitForHttp(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // Not up yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`LiveKit didn't come up at ${url}`);
}

async function start() {
    docker(["rm", "--force", CONTAINER], { allowFailure: true });
    // Media goes over one UDP and one TCP port, advertised as 127.0.0.1 so browsers on this machine reach them.
    const config = [
        "port: 7880",
        "rtc:",
        "  tcp_port: 7881",
        "  udp_port: 7882",
        "  use_external_ip: false",
        "  node_ip: 127.0.0.1",
        "keys:",
        `  ${LIVEKIT_KEY}: ${LIVEKIT_SECRET}`,
        "logging:",
        "  level: warn",
        "",
    ].join("\n");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${CONTAINER}-`));
    const file = path.join(dir, "livekit.yaml");
    fs.writeFileSync(file, config, { mode: 0o644 });
    docker([
        "run", "--detach",
        "--name", CONTAINER,
        "--publish", "127.0.0.1:7880:7880",
        "--publish", "127.0.0.1:7881:7881",
        "--publish", "127.0.0.1:7882:7882/udp",
        "--volume", `${file}:/livekit.yaml:ro`,
        IMAGE,
        "--config", "/livekit.yaml",
    ]);
    await waitForHttp("http://127.0.0.1:7880", 60_000);
    console.log(`LiveKit (${IMAGE}) is ready at ws://127.0.0.1:7880.`);
}

function stop() {
    docker(["rm", "--force", CONTAINER], { allowFailure: true });
    console.log("LiveKit stopped.");
}

const command = process.argv[2];
if (command === "start") await start();
else if (command === "stop") stop();
else {
    console.log("Usage: node scripts/test-livekit.mjs start|stop");
    process.exitCode = 1;
}
