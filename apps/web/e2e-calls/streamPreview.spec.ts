// SPDX-License-Identifier: AGPL-3.0-only
// "Streaming Now": while Alice shares her screen, Bob hovers her LIVE badge in the channel list and sees a snapshot.
import { expect, test } from "@playwright/test";

import { joinCall, voiceHall } from "./support";

test.use({
    launchOptions: {
        args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
            "--auto-select-desktop-capture-source=Entire screen",
            "--auto-accept-this-tab-capture",
        ],
    },
});

test("hovering someone who is streaming shows a preview of their screen", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Bob"]);
    const alice = await joinCall(browser, hall.users[0]!);
    const bob = await joinCall(browser, hall.users[1]!);
    await expect(bob.getByTestId("call-participant")).toHaveCount(2, { timeout: 60_000 });

    await alice.getByTitle("Share screen").first().click();
    // The source picker (if shown) takes the first source.
    const pick = alice.getByTestId("screen-share-source").first();
    if (await pick.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await pick.click();
        await alice.getByRole("button", { name: /^(Share|Go Live|Start)/ }).last().click();
    }
    const aliceRow = bob.locator(".room-item-voice-user").filter({ hasText: "Alice" });
    await expect(aliceRow.locator(".room-item-voice-live-badge")).toBeVisible({ timeout: 30_000 });
    await aliceRow.hover();
    const card = bob.getByTestId("stream-hover-card");
    await expect(card).toContainText("Streaming Now");
    await expect(card.getByTestId("stream-hover-image")).toBeVisible({ timeout: 40_000 });
    await expect(card.getByRole("button", { name: "Watch Stream" })).toBeVisible();
});
