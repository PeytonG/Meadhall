// SPDX-License-Identifier: AGPL-3.0-only
// Like Discord, browsing to Home → Friends during a call keeps the call going (it used to hang up).
import { expect, test } from "@playwright/test";

import { hearsSomeone, joinCall, voiceHall } from "./support";

test("opening Friends during a call keeps you in the call", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Bob"]);
    const alice = await joinCall(browser, hall.users[0]!);
    const bob = await joinCall(browser, hall.users[1]!);
    await expect(alice.getByTestId("call-participant")).toHaveCount(2, { timeout: 60_000 });
    await expect.poll(() => hearsSomeone(alice), { timeout: 60_000 }).toBe(true);

    await alice.getByTestId("rail-home").click();
    await alice.getByTestId("home-friends").click();
    await expect(alice.locator(".friends-view")).toBeVisible();
    // Still connected: the dock says so, Bob still sees Alice, and Alice still hears Bob.
    await expect(alice.getByTestId("voice-pill")).toContainText("Voice Connected");
    await alice.waitForTimeout(5_000);
    await expect(alice.getByTestId("voice-pill")).toContainText("Voice Connected");
    await expect(bob.getByTestId("call-participant")).toHaveCount(2);
    expect(await hearsSomeone(alice)).toBe(true);
});
