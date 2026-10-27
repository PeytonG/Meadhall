// SPDX-License-Identifier: AGPL-3.0-only
// Push to talk in a real call: the mic only sends while the key is held, talking with it released shows a
// reminder, and the key can be changed. (Chromium's fake mic beeps constantly, so it "talks" the whole time.)
import { expect, test, type Locator, type Page } from "@playwright/test";

import { joinCall, voiceHall } from "./support";

function card(page: Page, userId: string): Locator {
    return page.locator(`[data-testid='call-participant'][data-identity^='${userId}:']`);
}

async function staysQuiet(page: Page, userId: string, ms: number): Promise<boolean> {
    const until = Date.now() + ms;
    while (Date.now() < until) {
        if (await card(page, userId).evaluate((element) => element.classList.contains("is-speaking"))) return false;
        await page.waitForTimeout(200);
    }
    return true;
}

test("push to talk: the mic sends only while the key is held, with a reminder when talking without it", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Bob"]);
    const alice = await joinCall(browser, hall.users[0]!);
    const bob = await joinCall(browser, hall.users[1]!);
    const aliceId = hall.users[0]!.userId;
    await expect(bob.getByTestId("call-participant")).toHaveCount(2, { timeout: 60_000 });

    // Alice joins with her mic on, so Bob hears her (the fake mic's beeps make her "speak").
    await expect(card(bob, aliceId)).toHaveClass(/is-speaking/, { timeout: 30_000 });

    // Push to talk on: the mic closes, the button says which key to hold.
    await alice.getByTitle("Voice settings").click();
    await alice.getByTestId("call-ptt-toggle").check();
    await expect(alice.locator(".voice-ctrl-label").filter({ hasText: "PTT" })).toHaveText("PTT `");
    await expect(card(bob, aliceId)).not.toHaveClass(/is-speaking/, { timeout: 15_000 });
    expect(await staysQuiet(bob, aliceId, 3000)).toBe(true);

    // She's "talking" without the key: a reminder shows (only to her).
    await expect(alice.getByTestId("ptt-notice")).toContainText("Push to talk is on", { timeout: 15_000 });
    await expect(bob.getByTestId("ptt-notice")).toHaveCount(0);
    if (process.env.PREVIEW_DIR) await alice.locator(".voice-room-panel").screenshot({ path: `${process.env.PREVIEW_DIR}/push-to-talk.png` });

    // Holding the key sends her voice and hides the reminder; letting go stops it again.
    await alice.keyboard.down("Backquote");
    await expect(alice.getByTestId("ptt-notice")).toHaveCount(0);
    await expect(card(bob, aliceId)).toHaveClass(/is-speaking/, { timeout: 30_000 });
    await alice.keyboard.up("Backquote");
    await expect(alice.locator(".voice-ctrl-label").filter({ hasText: "PTT" })).toHaveText("PTT `");
    await expect(card(bob, aliceId)).not.toHaveClass(/is-speaking/, { timeout: 15_000 });

    // A different key: V. In the chat box a letter key types instead of talking.
    await alice.getByTestId("call-ptt-key").click();
    await expect(alice.getByTestId("call-ptt-key")).toHaveText("Press a key…");
    await alice.keyboard.press("KeyV");
    await expect(alice.getByTestId("call-ptt-key")).toHaveText("Key: V");
    await alice.keyboard.down("KeyV");
    await expect(card(bob, aliceId)).toHaveClass(/is-speaking/, { timeout: 30_000 });
    await alice.keyboard.up("KeyV");
    await expect(card(bob, aliceId)).not.toHaveClass(/is-speaking/, { timeout: 15_000 });

    // Turning it off leaves the mic as it was (closed); the normal mute button is back.
    await alice.getByTestId("call-ptt-toggle").uncheck();
    await expect(alice.getByTitle("Unmute microphone")).toBeVisible();
    await expect(alice.getByTestId("ptt-notice")).toHaveCount(0);
});
