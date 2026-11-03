// SPDX-License-Identifier: AGPL-3.0-only
// The ? button opens Meadhall's help (docs/help/meadhall-help.md): categories, and search that finds answers.
import { expect, test } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("the help button shows categorized, searchable help", async ({ page }) => {
    const user = await registerUser("helpme");
    await signIn(page, user);
    await page.getByTestId("header-help").click();
    const help = page.getByTestId("help-dialog");
    await expect(help.getByRole("navigation", { name: "Help categories" })).toContainText("Calls, voice and screen sharing");
    await help.getByRole("button", { name: "Friends and direct messages" }).click();
    await expect(help).toContainText("How do I add a friend?");
    await help.getByLabel("Search help").fill("share screen");
    await expect(help.locator("details").first()).toContainText("How do I share my screen?");
    await expect(help.locator("details").first()).toContainText("pick a screen or window");
});
