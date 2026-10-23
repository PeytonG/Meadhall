// SPDX-License-Identifier: AGPL-3.0-only
// The speaking campfire setting is saved to the Matrix profile (extended profiles), so other people's apps can read it.
import { expect, test } from "@playwright/test";

import { readProfileField, registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

const KEY = "io.github.peytong.meadhall.campfire";

test("the campfire can be turned off, and the choice is saved where others can read it", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await signIn(page, alice);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Audio", exact: true }).click();

    const card = page.locator(".settings-section-card", { has: page.getByRole("heading", { name: "Speaking campfire" }) });
    await expect(card.getByTestId("pixel-campfire")).toBeVisible();
    if (process.env.PREVIEW_DIR) {
        await card.screenshot({ path: `${process.env.PREVIEW_DIR}/campfire-settings.png` });
    }

    await card.getByTestId("campfire-toggle").uncheck();
    await expect(card.locator(".voice-room-speaking-indicator.is-speaking")).toBeVisible();
    await expect.poll(() => readProfileField(bob, alice.userId, KEY).catch(() => null), { timeout: 15_000 }).toEqual({
        enabled: false,
        color: "#ff7a1a",
    });
});
