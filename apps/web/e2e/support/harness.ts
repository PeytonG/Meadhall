// SPDX-License-Identifier: AGPL-3.0-only
// Bundles a component harness (e2e/harness/*.tsx) with the app's stylesheets into a page, for layout tests of
// pieces that can't be reached in the E2E stack (e.g. in-call UI, which needs a LiveKit server).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { build } from "vite";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STYLES = ["src/ui/styles/App.css", "src/ui/settings/styles.css", "src/ui/styles/pixel.css"];

export async function openHarness(page: Page, harness: string, globals: Record<string, unknown> = {}): Promise<void> {
    const output = await build({
        root: webRoot,
        logLevel: "silent",
        configFile: false,
        build: {
            write: false,
            minify: false,
            lib: { entry: path.join(webRoot, "e2e/harness", harness), formats: ["iife"], name: "harness", fileName: "harness" },
        },
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
    });
    const outputs = (Array.isArray(output) ? output : [output]) as Array<{ output: Array<{ type: string; code?: string }> }>;
    const script = outputs[0].output.find((chunk) => chunk.type === "chunk")?.code ?? "";
    const css = STYLES.map((file) => fs.readFileSync(path.join(webRoot, file), "utf8")).join("\n");
    await page.setContent(`<!doctype html><html data-theme="dark"><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: `Object.assign(window, ${JSON.stringify(globals)});` });
    await page.addScriptTag({ content: script });
}
