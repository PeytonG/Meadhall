// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page } from "@playwright/test";

import type { ApiUser } from "./matrixApi";

// Waits for the app shell, skipping the optional secure backup setup and session check a fresh account (or a
// reload before backup is set up) is offered.
export async function waitForAppShell(page: Page): Promise<void> {
    const appShell = page.locator(".rail-logo");
    const skip = page.getByRole("button", { name: "Skip for now" });
    await expect(appShell.or(skip).first()).toBeVisible({ timeout: 60_000 });
    for (let attempt = 0; attempt < 3 && !(await appShell.isVisible()); attempt += 1) {
        if (await skip.isVisible()) {
            await skip.click();
        }
        await expect(appShell.or(skip).first()).toBeVisible({ timeout: 30_000 });
    }
    await expect(appShell.getByRole("img", { name: "Meadhall" })).toBeVisible();
}

export async function signIn(page: Page, user: ApiUser): Promise<void> {
    await page.goto("/");
    await page.getByLabel("Username or email").fill(user.username);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();
    await waitForAppShell(page);
}
