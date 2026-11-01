// SPDX-License-Identifier: AGPL-3.0-only
// The sign-in look picker: offered once per account, previews live, and the choice follows the account to other
// devices (a second browser picks it up without being asked).
import { expect, test } from "@playwright/test";

import { readAccountData, registerUser, setAccountData } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("the look picker is offered on sign-in and the choice follows the account", async ({ page, browser }) => {
    const alice = await registerUser("alice");
    // A brand-new account: no look chosen yet.
    await setAccountData(alice, "io.github.peytong.meadhall.appearance", {});
    await signIn(page, alice);

    const picker = page.getByTestId("look-picker");
    await expect(picker).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-shape", "pixel");

    // Picking previews straight away, behind the picker too.
    await page.getByTestId("look-smooth").click();
    await expect(page.locator("html")).toHaveAttribute("data-shape", "smooth");
    await expect(page.locator("html")).toHaveAttribute("data-icon-style", "smooth");
    // One part back to pixel.
    await picker.getByRole("radiogroup", { name: "Font" }).getByRole("radio", { name: "Pixel" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-font", "pixel");
    await page.getByTestId("look-picker-done").click();
    await expect(picker).toHaveCount(0);

    await expect
        .poll(async () => ((await readAccountData(alice, "io.github.peytong.meadhall.appearance")).appearance as Record<string, unknown> | undefined)?.shapeStyle)
        .toBe("smooth");

    // Another device: same look, no picker.
    const other = await browser.newPage();
    await signIn(other, alice);
    await expect(other.locator("html")).toHaveAttribute("data-shape", "smooth");
    await expect(other.locator("html")).toHaveAttribute("data-font", "pixel");
    await expect(other.getByTestId("look-picker")).toHaveCount(0);
    await other.close();
});
