// SPDX-License-Identifier: AGPL-3.0-only
// Bundles a component harness (e2e/harness/*.tsx) with the app's stylesheets and fonts into a page, for layout tests
// and screenshots of pieces that can't be reached in the E2E stack (e.g. in-call UI, which needs a LiveKit server).
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { build } from "vite";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

type BuildOutput = { output: Array<{ type: string; code?: string; fileName?: string; source?: string | Uint8Array }> };

export async function openHarness(page: Page, harness: string, globals: Record<string, unknown> = {}): Promise<void> {
    const output = await build({
        root: webRoot,
        logLevel: "silent",
        configFile: false,
        build: {
            write: false,
            minify: false,
            // Fonts and images inline, since the page has no server to fetch them from.
            assetsInlineLimit: 50 * 1024 * 1024,
            cssCodeSplit: false,
            lib: { entry: path.join(webRoot, "e2e/harness", harness), formats: ["iife"], name: "harness", fileName: "harness" },
        },
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
    });
    const bundle = (Array.isArray(output) ? output : [output]) as BuildOutput[];
    const script = bundle[0].output.find((chunk) => chunk.type === "chunk")?.code ?? "";
    // The app's stylesheets and fonts, imported by the harness (e2e/harness/styles.ts).
    const css = bundle[0].output
        .filter((asset) => asset.type === "asset" && asset.fileName?.endsWith(".css"))
        .map((asset) => (typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source)))
        .join("\n");
    await page.setContent(
        `<!doctype html><html data-theme="dark" data-font="pixel" data-pixel-emoji="on"><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
    );
    await page.addScriptTag({ content: `Object.assign(window, ${JSON.stringify(globals)});` });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => document.fonts.ready);
}
