// SPDX-License-Identifier: AGPL-3.0-only
// Layout preview for development: seeds the demo hall and saves desktop and phone screenshots of the main views.
//   PREVIEW_DIR=<folder> pnpm --dir apps/web exec playwright test preview
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedHall } from "./support/seedHall";
import { signIn } from "./support/ui";

const OUTPUT = process.env.PREVIEW_DIR ?? "";
test.skip(!OUTPUT, "Set PREVIEW_DIR to save layout previews");

async function shot(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUTPUT, `${name}.png`) });
}

for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["tablet", { width: 820, height: 1180 }],
    ["phone", { width: 390, height: 844 }],
] as const) {
    test(`layout preview (${label})`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await page.getByRole("button", { name: "Register" }).click();
        await shot(page, `${label}-0-register`);
        const { viewer } = await seedHall();
        await signIn(page, viewer);
        await shot(page, `${label}-1-home`);

        await page.locator(".pane-user-card").click();
        await page.getByRole("button", { name: "Appearance", exact: true }).click();
        await page.getByRole("button", { name: "Other", exact: true }).click();
        await shot(page, `${label}-4-fonts`);
        await page.getByRole("button", { name: "Audio", exact: true }).click();
        await page.getByRole("radio", { name: "Giant" }).click();
        await shot(page, `${label}-5-voice-changer`);
        await page.keyboard.press("Escape");

        await page.getByText("Shieldwall").first().click();
        await expect(page.getByText("Who's bringing the shields tonight?")).toBeVisible();
        await shot(page, `${label}-2-group`);

        if (label === "phone") {
            await page.getByRole("button", { name: "Back to channels" }).click();
        }
        await page.getByTitle("The Mead Hall").click();
        await page.getByText("#general", { exact: true }).first().click();
        await expect(page.getByText("Then it's settled: Fireside at sundown.")).toBeVisible();
        await shot(page, `${label}-3-channel`);
    });
}
