// SPDX-License-Identifier: AGPL-3.0-only
// Pinning: the space owner pins a message from its menu and it shows in the pin panel (for others too); someone
// without the pin permission doesn't get the option; unpinning removes it.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, registerUser, sendMessage } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("pinning a message shows it in the pin panel for everyone, and only pinners can pin", async ({ page, browser }) => {
    const owner = await registerUser("owner");
    const member = await registerUser("member");
    const { channelId } = await createSpaceWithChannel(owner, member, { space: "Pin Hall", channel: "general" });
    await sendMessage(member, channelId, "The meeting is at noon");

    await signIn(page, owner);
    await page.getByTitle("Pin Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    const message = page.locator(".timeline-event").filter({ hasText: "The meeting is at noon" });
    await message.click({ button: "right" });
    await page.getByTestId("message-pin").click();
    await page.getByRole("button", { name: "Pins panel" }).click();
    const pins = page.getByTestId("pins-panel");
    await expect(pins.getByTestId("pinned-message")).toContainText("The meeting is at noon");

    // The member sees the pin, but can't pin or unpin.
    const memberPage = await (await browser.newContext()).newPage();
    await signIn(memberPage, member);
    await memberPage.getByTitle("Pin Hall").click();
    await memberPage.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    await memberPage.getByRole("button", { name: "Pins panel" }).click();
    await expect(memberPage.getByTestId("pinned-message")).toContainText("The meeting is at noon");
    await expect(memberPage.getByTestId("pinned-message").getByRole("button", { name: "Unpin" })).toHaveCount(0);
    await memberPage.locator(".timeline-event").filter({ hasText: "The meeting is at noon" }).click({ button: "right" });
    await expect(memberPage.getByTestId("message-pin")).toHaveCount(0);

    // The owner unpins it from the panel; it goes away for the member too.
    await pins.getByRole("button", { name: "Unpin" }).click();
    await expect(pins.getByTestId("pinned-message")).toHaveCount(0);
    await expect(memberPage.getByTestId("pinned-message")).toHaveCount(0, { timeout: 15_000 });
});
