// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig, devices } from "@playwright/test";

// E2E tests drive the production build against the test Synapse: start it with `node scripts/test-synapse.mjs start`.
export default defineConfig({
    testDir: "e2e",
    timeout: 120_000,
    expect: { timeout: 20_000 },
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
    use: {
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: "pnpm run build && node e2e/serve.mjs",
        // A release version, as the release workflow stamps it, so the phone update notice has something to compare.
        env: { VITE_MEADHALL_VERSION: "0.3.0" },
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
});
