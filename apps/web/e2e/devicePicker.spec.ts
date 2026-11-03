// SPDX-License-Identifier: AGPL-3.0-only
// The arrows next to the mic and headphones (like Discord's): pick a device there, or open Voice Settings.
import { expect, test } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

test("the mic and speaker arrows list devices and open voice settings", async ({ page }) => {
    const user = await registerUser("devices");
    await signIn(page, user);

    await page.getByTestId("mic-options").click();
    const menu = page.getByRole("menu", { name: "Input device" });
    await expect(menu.getByRole("menuitemradio", { name: "Default" })).toHaveAttribute("aria-checked", "true");
    const devices = menu.getByRole("menuitemradio");
    if ((await devices.count()) > 1) {
        await devices.nth(1).click();
        await page.getByTestId("mic-options").click();
        await expect(menu.getByRole("menuitemradio").nth(1)).toHaveAttribute("aria-checked", "true");
    }
    await menu.getByRole("menuitem", { name: "Voice Settings" }).click();
    await expect(page.getByRole("heading", { name: "Audio" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByTestId("speaker-options").click();
    await expect(page.getByRole("menu", { name: "Output device" })).toContainText("Voice Settings");
});
