// SPDX-License-Identifier: AGPL-3.0-only
// Appearance → Shapes: pixel (square frames, bevelled buttons; the default) or smooth (rounded), independent of the
// font and icon choices. Profile pictures stay round either way.
import { expect, test, type Page } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { signIn, waitForAppShell } from "./support/ui";

const radius = (page: Page, selector: string): Promise<number> =>
    page.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0);

test("shapes are pixel by default and can be switched to smooth", async ({ page }) => {
    const alice = await registerUser("alice");
    await signIn(page, alice);
    await expect(page.locator("html")).toHaveAttribute("data-shape", "pixel");
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    expect(await radius(page, ".settings-section-card")).toBe(0);
    expect(await radius(page, ".settings-button")).toBe(0);

    await page.getByTestId("shape-smooth").click();
    await expect(page.locator("html")).toHaveAttribute("data-shape", "smooth");
    expect(await radius(page, ".settings-section-card")).toBeGreaterThan(0);
    // The font and icons stay as chosen (pixel by default).
    await expect(page.locator("html")).toHaveAttribute("data-font", "pixel");
    await expect(page.locator("html")).toHaveAttribute("data-icon-style", "pixel");
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/shapes-smooth.png` });

    // Kept after reopening, and avatars are round either way.
    await page.reload();
    await waitForAppShell(page);
    await expect(page.locator("html")).toHaveAttribute("data-shape", "smooth", { timeout: 30_000 });
    expect(await radius(page, ".pane-user-avatar")).toBeGreaterThan(0);
});
