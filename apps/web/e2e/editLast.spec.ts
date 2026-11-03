// SPDX-License-Identifier: AGPL-3.0-only
// ↑ in an empty message box edits your last message, like Discord: Enter saves, Escape cancels; with text in the box
// ↑ moves the cursor as usual.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, registerUser, sendMessage } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("up arrow in an empty box edits your last message", async ({ page }) => {
    const owner = await registerUser("owner");
    const friend = await registerUser("friend");
    const { channelId } = await createSpaceWithChannel(owner, friend, { space: "Edit Hall", channel: "general" });
    await signIn(page, owner);
    await page.getByTitle("Edit Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();

    const box = page.getByRole("textbox", { name: /Message/ });
    await box.fill("Meet at the gate");
    await box.press("Enter");
    await expect(page.locator(".timeline-event").filter({ hasText: "Meet at the gate" })).toBeVisible();
    // Someone else's later message doesn't get picked.
    await sendMessage(friend, channelId, "ok see you");
    await expect(page.locator(".timeline-event").filter({ hasText: "ok see you" })).toBeVisible();

    await box.press("ArrowUp");
    await expect(box).toHaveValue("Meet at the gate");
    await box.fill("Meet at the north gate");
    await box.press("Enter");
    await expect(page.locator(".timeline-event").filter({ hasText: "Meet at the north gate" })).toBeVisible();
    await expect(box).toHaveValue("");

    // Escape leaves it as it was.
    await box.press("ArrowUp");
    await expect(box).toHaveValue("Meet at the north gate");
    await box.press("Escape");
    await expect(box).toHaveValue("");

    // With text in the box, ↑ doesn't start editing.
    await box.fill("draft");
    await box.press("ArrowUp");
    await expect(box).toHaveValue("draft");
});
