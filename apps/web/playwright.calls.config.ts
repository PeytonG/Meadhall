// SPDX-License-Identifier: AGPL-3.0-only
// Real calls: the production build, the test Synapse, a real LiveKit server and a stand-in token service, with
// Chromium's fake camera and microphone. Start the servers first:
//   node scripts/test-synapse.mjs start && node scripts/test-livekit.mjs start
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "e2e-calls",
    timeout: 180_000,
    expect: { timeout: 30_000 },
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        permissions: ["camera", "microphone"],
        launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
    },
    webServer: [
        {
            command: "pnpm run build && node e2e/serve.mjs",
            url: "http://127.0.0.1:4173",
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
        },
        {
            command: "node e2e/support/lkTokenService.mjs",
            port: 7890,
            reuseExistingServer: !process.env.CI,
        },
    ],
});
