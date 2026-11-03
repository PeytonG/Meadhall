// SPDX-License-Identifier: AGPL-3.0-only
// Leaving a voice channel's call while it's still open shows Discord's join screen (who's in voice, Join Voice) instead
// of an empty page, and Join Voice gets you back in.
import { expect, test } from "@playwright/test";

import { joinCall, voiceHall } from "./support";

test("after leaving, the voice channel offers Join Voice and shows who is still there", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Bob"]);
    const alice = await joinCall(browser, hall.users[0]!);
    const bob = await joinCall(browser, hall.users[1]!);
    await expect(alice.getByTestId("call-participant")).toHaveCount(2, { timeout: 60_000 });

    await alice.getByTitle("Leave voice channel").click();
    const prompt = alice.getByTestId("voice-join-prompt");
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await expect(prompt).toContainText("Voice");
    await expect(prompt).toContainText("Bob is in voice", { timeout: 30_000 });
    await expect(alice.locator(".channel-header-title")).not.toContainText("#");
    if (process.env.PREVIEW_DIR) await alice.screenshot({ path: `${process.env.PREVIEW_DIR}/voice-join.png` });

    await prompt.getByTestId("voice-join").click();
    await expect(alice.getByTestId("call-participant")).toHaveCount(2, { timeout: 60_000 });

    // Everyone gone: the empty state.
    await bob.getByTitle("Leave voice channel").click();
    await alice.getByTitle("Leave voice channel").click();
    await expect(alice.getByTestId("voice-join-prompt")).toContainText("No one is currently in voice", { timeout: 60_000 });
});
