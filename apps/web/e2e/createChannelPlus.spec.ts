// SPDX-License-Identifier: AGPL-3.0-only
// Adding channels like Discord: the "+" on a category creates a channel in that category (a voice category starts as
// voice), and hovering a channel shows Create Invite.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("the + on a category creates a channel in it, and channels offer Create Invite", async ({ page }) => {
    const owner = await registerUser("owner");
    const friend = await registerUser("friend");
    await createSpaceWithChannel(owner, friend, { space: "Plus Hall", channel: "general" });
    await signIn(page, owner);
    await page.getByTitle("Plus Hall").click();

    // A category, renamed.
    await page.getByRole("button", { name: "+ Category" }).click();
    const nameInput = page.locator(".room-category-name-input");
    await nameInput.fill("Voice Channels");
    await nameInput.press("Enter");
    const category = page.locator(".room-category").filter({ hasText: "Voice Channels" });
    await expect(category).toBeVisible();

    // Its "+" opens Create channel; make a voice channel there.
    await category.getByTestId("category-create-channel").click();
    const dialog = page.getByRole("dialog", { name: "Create channel" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: /Voice/ }).click();
    await dialog.getByLabel("Room name").fill("Lounge");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(category.locator(".room-item").filter({ hasText: "Lounge" })).toBeVisible({ timeout: 30_000 });

    // The next one from the same "+" starts as voice (the category holds voice channels).
    await category.getByTestId("category-create-channel").click();
    await expect(dialog.getByRole("radio", { name: /Voice/ })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // Hovering a channel: Create Invite opens the space's invite dialog.
    const general = page.locator(".room-item").filter({ hasText: "general" });
    await general.hover();
    await general.getByRole("button", { name: /Invite people to general/ }).click();
    await expect(page.getByRole("dialog", { name: /Invite to Plus Hall/ })).toBeVisible();
});
