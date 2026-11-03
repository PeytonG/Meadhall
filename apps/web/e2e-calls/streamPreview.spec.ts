// SPDX-License-Identifier: AGPL-3.0-only
// "Streaming Now", like Discord: while Alice shares her screen, Bob (not in the call) hovers her LIVE badge, sees a
// snapshot, and clicking it joins the call with her stream on the big stage. Alice's own badge says
// "You're Streaming!".
import { expect, test } from "@playwright/test";

import { enableCalls, joinCall, voiceHall } from "./support";
import { signIn } from "../e2e/support/ui";

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

test("hovering a stream shows a preview, and clicking it joins and shows that stream", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Bob"]);
    const alice = await joinCall(browser, hall.users[0]!);
    await expect(alice.getByTestId("voice-pill")).toContainText("Voice Connected", { timeout: 60_000 });
    await alice.getByTitle("Share screen").first().click();
    const pick = alice.getByTestId("screen-share-source").first();
    if (await pick.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await pick.click();
        await alice.getByRole("button", { name: /^(Share|Go Live|Start)/ }).last().click();
    }

    // Alice's own badge.
    const ownRow = alice.locator(".room-item-voice-user").filter({ hasText: "Alice" });
    await expect(ownRow.locator(".room-item-voice-live-badge")).toBeVisible({ timeout: 30_000 });
    await ownRow.hover();
    await expect(alice.getByTestId("stream-hover-card")).toContainText("You're Streaming!");
    await alice.mouse.move(0, 0);

    // Bob is in the space but not in the call.
    const bob = await (await browser.newContext()).newPage();
    await enableCalls(bob);
    await signIn(bob, hall.users[1]!);
    await bob.getByTitle("Call Hall").click();
    const aliceRow = bob.locator(".room-item-voice-user").filter({ hasText: "Alice" });
    await expect(aliceRow.locator(".room-item-voice-live-badge")).toBeVisible({ timeout: 30_000 });
    await aliceRow.hover();
    const card = bob.getByTestId("stream-hover-card");
    await expect(card).toContainText("Streaming Now");
    await expect(card.getByTestId("stream-hover-image")).toBeVisible({ timeout: 40_000 });

    // Clicking the preview joins the call with Alice's stream on the stage.
    await card.getByTestId("stream-hover-preview").click();
    await expect(bob.getByTestId("voice-pill")).toContainText("Voice Connected", { timeout: 60_000 });
    await expect
        .poll(() => bob.evaluate(() => {
            const video = document.querySelector<HTMLVideoElement>(".voice-room-stage-video");
            return Boolean(video && video.videoWidth > 0);
        }), { timeout: 40_000 })
        .toBe(true);
});
