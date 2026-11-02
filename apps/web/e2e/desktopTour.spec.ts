// SPDX-License-Identifier: AGPL-3.0-only
// The desktop layout, screen by screen, for screenshots (PREVIEW_DIR) and a check that nothing overflows.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

async function shot(page: Page, name: string): Promise<void> {
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/desktop-${name}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test("desktop screens fit the window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(alice, "Alice");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await sendMessage(bob, dm, "Evening! Fire's lit, mead's poured.");
    const { channelId } = await createSpaceWithChannel(bob, alice, { space: "Mead Hall", channel: "general" });
    await sendMessage(bob, channelId, "Welcome to the hall.");

    await page.goto("/");
    await shot(page, "1-sign-in");
    await signIn(page, alice);
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().click();
    await expect(page.locator(".timeline").getByText("Fire's lit")).toBeVisible();
    await shot(page, "2-dm");
    await page.getByTitle("Mead Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    await expect(page.locator(".timeline").getByText("Welcome to the hall.")).toBeVisible();
    await shot(page, "3-channel");
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await shot(page, "4-settings");
});
