// SPDX-License-Identifier: AGPL-3.0-only
// Message notifications are on by default, and clicking one opens that conversation.
import { expect, test } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("a message in another conversation notifies, and clicking the notification opens it", async ({ page, context }) => {
    await context.grantPermissions(["notifications"]);
    await page.addInitScript(() => {
        const shown: Array<{ title: string; body: string; click: () => void }> = [];
        (window as unknown as { shownNotifications: typeof shown }).shownNotifications = shown;
        class FakeNotification {
            public static permission = "granted";
            public static requestPermission = async () => "granted";
            public onclick: (() => void) | null = null;
            constructor(title: string, options?: { body?: string }) {
                shown.push({ title, body: options?.body ?? "", click: () => this.onclick?.() });
            }
            public close(): void {}
        }
        (window as unknown as { Notification: unknown }).Notification = FakeNotification;
    });

    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const carol = await registerUser("carol");
    await setDisplayName(bob, "Bob");
    const dmBob = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    const dmCarol = await createRoom(carol, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dmBob);
    await joinRoom(alice, dmCarol);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dmBob], [carol.userId]: [dmCarol] });
    await sendMessage(carol, dmCarol, "hello from carol");
    await signIn(page, alice);
    await page.getByRole("region", { name: "Direct messages" }).getByText(/carol/i).click();
    await expect(page.getByText("hello from carol")).toBeVisible();

    await sendMessage(bob, dmBob, "Fireside at sundown?");
    await expect
        .poll(() => page.evaluate(() => (window as unknown as { shownNotifications: Array<{ title: string; body: string }> }).shownNotifications.map((n) => `${n.title}|${n.body}`)), { timeout: 15_000 })
        .toContainEqual(expect.stringContaining("Fireside at sundown?"));

    await page.evaluate(() => {
        const shown = (window as unknown as { shownNotifications: Array<{ body: string; click: () => void }> }).shownNotifications;
        shown.find((n) => n.body.includes("Fireside"))?.click();
    });
    await expect(page.getByText("Fireside at sundown?")).toBeVisible();
    await expect(page.locator(".channel-header-title")).toContainText(/bob/i);
});
