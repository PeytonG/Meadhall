// SPDX-License-Identifier: AGPL-3.0-only
// Incoming call ringing: the person being called sees "X is calling" and hears the ringtone; the caller doesn't.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendEvent, setAccountData, setDisplayName, type ApiUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

// Counts oscillators started and audio contexts closed, to tell whether the ringtone is playing.
async function spyOnAudio(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const stats = { oscillators: 0, open: 0 };
        (window as unknown as { audioStats: typeof stats }).audioStats = stats;
        const Original = window.AudioContext;
        window.AudioContext = class extends Original {
            constructor(...args: ConstructorParameters<typeof AudioContext>) {
                super(...args);
                stats.open += 1;
                const close = this.close.bind(this);
                this.close = async () => {
                    stats.open -= 1;
                    return close();
                };
                const create = this.createOscillator.bind(this);
                this.createOscillator = () => {
                    stats.oscillators += 1;
                    return create();
                };
            }
        } as typeof AudioContext;
    });
}

// A real client relates the notification to its call-membership event; any existing event will do here.
async function ring(caller: ApiUser, roomId: string): Promise<void> {
    const relatedEventId = await sendEvent(caller, roomId, "m.room.message", { msgtype: "m.text", body: "calling" });
    await sendEvent(caller, roomId, "org.matrix.msc4075.rtc.notification", {
        "m.mentions": { user_ids: [], room: true },
        notification_type: "ring",
        "m.relates_to": { rel_type: "m.reference", event_id: relatedEventId },
        sender_ts: Date.now(),
        lifetime: 30_000,
    });
}

test("the person being called sees and hears the call; dismissing stops the ring", async ({ page }) => {
    await spyOnAudio(page);
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await signIn(page, alice);

    await ring(bob, dm);
    const card = page.getByTestId("incoming-call");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("Bob");
    await expect(card).toContainText("is calling you");
    await expect.poll(() => page.evaluate(() => (window as unknown as { audioStats: { oscillators: number } }).audioStats.oscillators)).toBeGreaterThan(0);

    await card.getByRole("button", { name: "Dismiss call" }).click();
    await expect(card).toBeHidden();
    const after = await page.evaluate(() => (window as unknown as { audioStats: { oscillators: number } }).audioStats.oscillators);
    await page.waitForTimeout(3_000);
    expect(await page.evaluate(() => (window as unknown as { audioStats: { oscillators: number } }).audioStats.oscillators), "no more notes after dismiss").toBe(after);
});

test("your own call notification doesn't ring for you", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await signIn(page, alice);

    await ring(alice, dm);
    await page.waitForTimeout(4_000);
    await expect(page.getByTestId("incoming-call")).toHaveCount(0);
});
