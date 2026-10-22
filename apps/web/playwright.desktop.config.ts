// SPDX-License-Identifier: AGPL-3.0-only
// Runs the real desktop (Electron) app. Build it first: pnpm --dir apps/desktop run build
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "e2e-desktop",
    timeout: 120_000,
    workers: 1,
    reporter: "list",
});
