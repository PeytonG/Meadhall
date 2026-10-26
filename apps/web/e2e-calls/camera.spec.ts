// SPDX-License-Identifier: AGPL-3.0-only
// Webcams in a real call: turning yours on shows it to everyone (and to you, mirrored); turning it off removes it.
import { expect, test, type Page } from "@playwright/test";

import { joinCall, voiceHall } from "./support";

// A camera tile whose video is actually playing frames (Chromium's fake camera draws a moving pattern).
async function playingVideo(page: Page, local: boolean): Promise<boolean> {
    return page.evaluate((wantLocal) => {
        const tile = [...document.querySelectorAll<HTMLElement>("[data-testid='camera-tile']")].find((element) => (element.dataset.local === "true") === wantLocal);
        const video = tile?.querySelector("video");
        const track = (video?.srcObject as MediaStream | null | undefined)?.getVideoTracks()[0];
        return Boolean(video && video.videoWidth > 0 && !video.paused && video.readyState >= 2 && track?.readyState === "live");
    }, local);
}

test("a webcam shows for everyone in the call, and goes away when turned off", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Bob"]);
    const alice = await joinCall(browser, hall.users[0]!);
    const bob = await joinCall(browser, hall.users[1]!);
    await expect(bob.getByTestId("call-participant")).toHaveCount(2, { timeout: 60_000 });

    await alice.getByTestId("camera-toggle").click();
    await expect(alice.getByTestId("camera-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => playingVideo(alice, true), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => playingVideo(bob, false), { timeout: 30_000 }).toBe(true);
    await expect(bob.getByTestId("camera-tile")).toContainText("Alice");
    if (process.env.PREVIEW_DIR) await bob.locator(".voice-room-panel").screenshot({ path: `${process.env.PREVIEW_DIR}/webcam.png` });

    // Both cameras on: two tiles each.
    await bob.getByTestId("camera-toggle").click();
    await expect(alice.getByTestId("camera-tile")).toHaveCount(2, { timeout: 30_000 });
    await expect(bob.getByTestId("camera-tile")).toHaveCount(2, { timeout: 30_000 });

    await alice.getByTestId("camera-toggle").click();
    await expect(bob.getByTestId("camera-tile")).toHaveCount(1, { timeout: 30_000 });
    await expect(alice.getByTestId("camera-tile")).toHaveCount(1);
});
