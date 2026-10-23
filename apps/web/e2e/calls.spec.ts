// SPDX-License-Identifier: AGPL-3.0-only
// Incoming call ringing: the person being called sees "X is calling" and hears the ringtone; the caller doesn't.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendEvent, setAccountData, setDisplayName, type ApiUser } from "./support/matrixApi";
import { startEncryptingClient } from "./support/cryptoClient";
import { emulateWindowsDesktopApp, isWindowDragRegionAt, samplePoints } from "./support/desktop";
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

test("a call in an encrypted DM rings too (the notification arrives encrypted)", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, {
        is_direct: true,
        preset: "trusted_private_chat",
        invite: [alice.userId],
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await signIn(page, alice);

    const bobClient = await startEncryptingClient(bob);
    try {
        // Bob's client encrypts for Alice's signed-in device.
        await expect.poll(() => bobClient.getRoom(dm)?.hasEncryptionStateEvent() ?? false, { timeout: 15_000 }).toBe(true);
        const related = await bobClient.sendTextMessage(dm, "calling you");
        await bobClient.sendEvent(dm, "org.matrix.msc4075.rtc.notification" as never, {
            "m.mentions": { user_ids: [], room: true },
            notification_type: "ring",
            "m.relates_to": { rel_type: "m.reference", event_id: related.event_id },
            sender_ts: Date.now(),
            lifetime: 30_000,
        } as never);
        await expect(page.getByTestId("incoming-call")).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId("incoming-call")).toContainText("Bob");
    } finally {
        bobClient.stopClient();
    }
});

// Reported on desktop: with another chat open, the call card's Join and Dismiss did nothing. The card sits over the
// title-bar strip, which drags the window; clicks there were moving the window instead.
test("on desktop, the incoming call card's buttons take clicks (not the window drag strip)", async ({ page }) => {
    await emulateWindowsDesktopApp(page);
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const carol = await registerUser("carol");
    await setDisplayName(bob, "Bob");
    await setDisplayName(carol, "Carol");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    const other = await createRoom(carol, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await joinRoom(alice, other);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm], [carol.userId]: [other] });
    await signIn(page, alice);
    // In a different conversation when the call comes in.
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: "Carol" }).click();

    await ring(bob, dm);
    const card = page.getByTestId("incoming-call");
    await expect(card).toBeVisible({ timeout: 15_000 });
    for (const selector of ['[data-testid="incoming-call"] .incoming-call-join', '[data-testid="incoming-call"] .incoming-call-dismiss']) {
        for (const point of await samplePoints(page, selector)) {
            expect(await isWindowDragRegionAt(page, point.x, point.y), `${selector} at ${point.x},${point.y}`).toBe(false);
        }
    }
    await card.getByRole("button", { name: "Dismiss call" }).click();
    await expect(card).toBeHidden();
});
