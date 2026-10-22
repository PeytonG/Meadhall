// SPDX-License-Identifier: AGPL-3.0-only

import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { seedHall } from "./support/seedHall";
import { signIn, waitForAppShell } from "./support/ui";

// Captures the README screenshots into docs/screenshots. Run with:
//   CAPTURE_SCREENSHOTS=1 pnpm --dir apps/web exec playwright test screenshots
test.skip(!process.env.CAPTURE_SCREENSHOTS, "Set CAPTURE_SCREENSHOTS=1 to capture README screenshots");
test.use({ viewport: { width: 1440, height: 900 } });

const OUTPUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "screenshots");

async function capture(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(500); // let avatars and fonts settle
    await page.screenshot({ path: path.join(OUTPUT, `${name}.png`) });
}

test("captures README screenshots", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Meadhall" })).toBeVisible();
    await capture(page, "login");

    const { viewer } = await seedHall();
    await signIn(page, viewer);
    await page.getByTitle("The Mead Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    await expect(page.getByText("Then it's settled: Fireside at sundown.")).toBeVisible();
    await capture(page, "chat-dark");

    await page.locator(".pane-user-card").click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    const colorCard = page.locator(".settings-section-card", { has: page.getByRole("heading", { name: "Theme color" }) });
    await colorCard.scrollIntoViewIfNeeded();
    await expect(colorCard.locator(".pixel-color-wheel")).toBeVisible();
    await capture(page, "theme-color-wheel");
    await page.keyboard.press("Escape");

    // Switch to the light theme through the stored appearance setting.
    await page.evaluate(() => {
        const key = "heorot.user_settings.v1";
        const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
        settings.appearance = { ...(settings.appearance ?? {}), theme: "light" };
        localStorage.setItem(key, JSON.stringify(settings));
    });
    await page.reload();
    await waitForAppShell(page);
    await page.getByTitle("The Mead Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    await expect(page.getByText("Then it's settled: Fireside at sundown.")).toBeVisible();
    await capture(page, "chat-light");
});
