// SPDX-License-Identifier: AGPL-3.0-only
// Calls in an encrypted DM send events nobody reads (encryption keys, call memberships, ring signals). The server
// flags every encrypted event in a 1:1 room as notifying, and Meadhall used to pop up (with the raw event type) and
// ping for each of them. Only real messages should notify, and opening the chat clears its notifications.
import { expect, test } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { startEncryptingClient } from "./support/cryptoClient";
import { signIn } from "./support/ui";

test("call traffic doesn't notify; a real message does once; opening the chat clears it", async ({ page, context }) => {
    await context.grantPermissions(["notifications"]);
    await page.addInitScript(() => {
        const shown: Array<{ title: string; body: string; closed: boolean }> = [];
        (window as unknown as { shownNotifications: typeof shown }).shownNotifications = shown;
        class FakeNotification {
            public static permission = "granted";
            public static requestPermission = async () => "granted";
            public onclick: (() => void) | null = null;
            private readonly entry: { title: string; body: string; closed: boolean };
            constructor(title: string, options?: { body?: string }) {
                this.entry = { title, body: options?.body ?? "", closed: false };
                shown.push(this.entry);
            }
            public close(): void {
                this.entry.closed = true;
            }
        }
        (window as unknown as { Notification: unknown }).Notification = FakeNotification;
    });

    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const carol = await registerUser("carol");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, {
        is_direct: true,
        preset: "trusted_private_chat",
        invite: [alice.userId],
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await joinRoom(alice, dm);
    const elsewhere = await createRoom(carol, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, elsewhere);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm], [carol.userId]: [elsewhere] });
    await sendMessage(carol, elsewhere, "hi");
    await signIn(page, alice);
    // Somewhere else is open, so Bob's DM would notify.
    await page.getByTestId("home-row").filter({ hasText: /carol/i }).click();

    const bobClient = await startEncryptingClient(bob);
    const shown = () => page.evaluate(() => (window as unknown as { shownNotifications: Array<{ title: string; body: string; closed: boolean }> }).shownNotifications);
    try {
        await expect.poll(() => bobClient.getRoom(dm)?.hasEncryptionStateEvent() ?? false, { timeout: 15_000 }).toBe(true);
        // What a call sends: keys, a membership update, a ring signal (all encrypted here).
        for (let index = 0; index < 4; index += 1) {
            await bobClient.sendEvent(dm, "io.element.call.encryption_keys" as never, { keys: [{ index, key: "a2V5" }], call_id: "", device_id: "BOB" } as never);
        }
        await bobClient.sendEvent(dm, "org.matrix.msc3401.call.member" as never, { application: "m.call", call_id: "" } as never);
        await bobClient.sendStateEvent(dm, "org.matrix.msc3401.call.member" as never, { application: "m.call", call_id: "", device_id: "BOB", focus_active: { type: "livekit" } } as never, `_${bob.userId}_BOB`);
        // The call's ring / notify signals: the server has push rules for these. They ring through the call card,
        // never as a message notification.
        const related = await bobClient.sendEvent(dm, "m.room.message" as never, { msgtype: "m.notice", body: "" } as never);
        for (const type of ["ring", "notification"]) {
            await bobClient.sendEvent(dm, "org.matrix.msc4075.rtc.notification" as never, {
                "m.mentions": { user_ids: [], room: true },
                notification_type: type,
                "m.relates_to": { rel_type: "m.reference", event_id: related.event_id },
                sender_ts: Date.now(),
                lifetime: 30_000,
            } as never);
        }
        await page.waitForTimeout(4_000);
        expect(await shown(), "call traffic made no notifications").toEqual([]);

        await bobClient.sendTextMessage(dm, "Fireside at sundown?");
        await expect.poll(async () => (await shown()).map((entry) => entry.body), { timeout: 20_000 }).toEqual(["Fireside at sundown?"]);
        expect((await shown())[0]!.title).toContain("Bob");

        // Opening the chat clears it, and the chat stops counting as unread.
        await page.getByTestId("home-row").filter({ hasText: "Bob" }).click();
        await expect.poll(async () => (await shown())[0]!.closed).toBe(true);
        await expect(page.getByTestId("home-row").filter({ hasText: "Bob" })).not.toHaveClass(/has-unread/, { timeout: 15_000 });
    } finally {
        bobClient.stopClient();
    }
});
