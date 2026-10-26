// SPDX-License-Identifier: AGPL-3.0-only
// "Only people I have DMs with": activity arrives end-to-end encrypted, straight to your devices, and only from
// people you have a DM with. Bob and Carol are real encrypting clients (like another Meadhall would be).
import { expect, test } from "@playwright/test";
import type { MatrixClient } from "matrix-js-sdk";

import { startEncryptingClient } from "./support/cryptoClient";
import { createRoom, joinRoom, registerUser, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

const TYPE = "io.github.peytong.meadhall.activity";

async function sendActivity(from: MatrixClient, toUserId: string, activity: unknown, encrypted = true): Promise<void> {
    if (!encrypted) {
        const devices = (await from.getCrypto()!.getUserDeviceInfo([toUserId], true)).get(toUserId)!;
        await from.sendToDevice(TYPE, new Map([[toUserId, new Map([...devices.keys()].map((deviceId) => [deviceId, { activity, expires_in: 600_000 }]))]]));
        return;
    }
    const crypto = from.getCrypto()!;
    const devices = (await crypto.getUserDeviceInfo([toUserId], true)).get(toUserId);
    if (!devices?.size) throw new Error("no devices yet");
    const batch = await crypto.encryptToDeviceMessages(TYPE, [...devices.keys()].map((deviceId) => ({ userId: toUserId, deviceId })), { activity, expires_in: 600_000 });
    await from.queueToDevice(batch);
}

test("activity shared only with DM partners arrives encrypted, and nobody else can fake it", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const carol = await registerUser("carol");
    await setDisplayName(bob, "Bob");
    // An encrypted DM, like Meadhall makes (DM-only activity needs one).
    const dm = await createRoom(bob, {
        is_direct: true,
        preset: "trusted_private_chat",
        invite: [alice.userId],
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    // Carol shares a room with Alice, but not a DM.
    // (encrypted, so her client can really encrypt to Alice: the message arrives and has to be refused)
    const room = await createRoom(carol, {
        preset: "public_chat",
        name: "Hangout",
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await joinRoom(alice, room);

    await signIn(page, alice);
    const bobClient = await startEncryptingClient(bob);
    const carolClient = await startEncryptingClient(carol);
    try {
        const row = page.getByTestId("home-row").filter({ hasText: "Bob" });
        await expect(row).toBeVisible();
        // Alice's device keys are up once her app has signed in.
        await expect.poll(async () => (await bobClient.getCrypto()!.getUserDeviceInfo([alice.userId], true)).get(alice.userId)?.size ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);

        // Not encrypted: ignored (anyone could send that).
        await sendActivity(bobClient, alice.userId, { name: "Fake Game", since: Date.now(), kind: "playing" }, false);
        // Encrypted, but Carol isn't a DM partner: ignored too.
        await expect.poll(async () => (await carolClient.getCrypto()!.getUserDeviceInfo([alice.userId])).get(alice.userId)?.size ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
        await sendActivity(carolClient, alice.userId, { name: "Carol's Game", since: Date.now(), kind: "playing" });
        // Bob, encrypted: shown.
        await sendActivity(bobClient, alice.userId, { name: "Pixel Quest", since: Date.now(), kind: "listening", details: "Track 2" });
        await expect(row).toContainText("Listening to Pixel Quest · Track 2", { timeout: 30_000 });
        await expect(page.locator("body")).not.toContainText("Fake Game");
        await expect(page.locator("body")).not.toContainText("Carol's Game");

        // He stops: it goes away.
        await sendActivity(bobClient, alice.userId, null);
        await expect(row).not.toContainText("Pixel Quest", { timeout: 30_000 });
    } finally {
        bobClient.stopClient();
        carolClient.stopClient();
    }
});
