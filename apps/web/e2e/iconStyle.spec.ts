// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Appearance → Icons: pixel art by default, or smooth line icons; remembered.
import { expect, test } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { signIn, waitForAppShell } from "./support/ui";

test("icons are pixel art by default and can be switched to smooth", async ({ page }) => {
    const alice = await registerUser("alice");
    await signIn(page, alice);
    const micIcon = page.getByTestId("self-mute").locator("svg");
    await expect(micIcon).not.toHaveAttribute("data-icon-style", "smooth");
    await expect(micIcon).toHaveAttribute("shape-rendering", "crispEdges");

    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    const style = page.getByRole("radiogroup", { name: "Icon style" });
    await expect(style.getByRole("radio", { name: "Pixel" })).toHaveAttribute("aria-checked", "true");
    await style.getByRole("radio", { name: "Smooth" }).click();
    await page.keyboard.press("Escape");
    await expect(micIcon).toHaveAttribute("data-icon-style", "smooth");
    await expect(micIcon.locator("path").first()).toBeAttached();
    if (process.env.PREVIEW_DIR) await page.locator(".pane-bottom").screenshot({ path: `${process.env.PREVIEW_DIR}/icons-smooth.png` });

    await page.reload();
    await waitForAppShell(page);
    await expect(page.getByTestId("self-mute").locator("svg")).toHaveAttribute("data-icon-style", "smooth");

    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("radiogroup", { name: "Icon style" }).getByRole("radio", { name: "Pixel" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("self-mute").locator("svg")).toHaveAttribute("shape-rendering", "crispEdges");
});
