// SPDX-License-Identifier: AGPL-3.0-only
// The homeserver keeps someone's last status message after they leave, so closing Meadhall mid-game (or going
// invisible) used to leave "Playing ..." under their name for everyone. Like Discord, offline people show no status.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, registerUser, setDisplayName, setPresence } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("someone who went offline mid-game doesn't keep showing Playing", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob the Gamer");
    await createSpaceWithChannel(bob, alice, { space: "Game Hall", channel: "general" });
    await setPresence(bob, "online", "Playing Elden Ring");

    await signIn(page, alice);
    await page.getByTitle("Game Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    const bobRow = page.locator(".rs-member-row").filter({ hasText: "Bob the Gamer" });
    await expect(bobRow).toContainText("Playing Elden Ring", { timeout: 30_000 });

    // Bob's Meadhall closes (or he goes invisible): the server still has the message, but nobody should see it.
    await setPresence(bob, "offline", "Playing Elden Ring");
    await expect(bobRow).not.toContainText("Playing", { timeout: 30_000 });
    await expect(bobRow).toBeVisible();
});
