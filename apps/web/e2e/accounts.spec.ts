// SPDX-License-Identifier: AGPL-3.0-only
// Several accounts on one device: add a second account, switch between them, still get the other account's
// notifications, and signing out of one carries on as the other.
import { expect, test } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn, waitForAppShell } from "./support/ui";

test("add a second account, get notified for the first, switch by clicking, and sign out to the other", async ({ page, context }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const carol = await registerUser("carol");
    await setDisplayName(alice, "Alice");
    await setDisplayName(bob, "Bob");
    await setDisplayName(carol, "Carol");
    const dm = await createRoom(carol, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [carol.userId]: [dm] });

    // Record web notifications (the other account's arrive this way in browsers) instead of showing them.
    await context.grantPermissions(["notifications"]);
    await page.addInitScript(() => {
        const shown: Array<{ title: string; body: string; click: () => void }> = [];
        (window as unknown as { shownNotifications: typeof shown }).shownNotifications = shown;
        class RecordingNotification {
            static permission = "granted";
            static requestPermission = async (): Promise<string> => "granted";
            onclick: (() => void) | null = null;
            constructor(title: string, options: { body?: string } = {}) {
                shown.push({ title, body: options.body ?? "", click: () => this.onclick?.() });
            }
            close(): void {}
        }
        (window as unknown as { Notification: unknown }).Notification = RecordingNotification;
    });
    await page.clock.install();

    await signIn(page, alice);
    await page.getByTestId("user-card").click();
    await page.getByTestId("add-account").click();
    await expect(page.getByTestId("back-to-account")).toContainText(alice.userId);
    await signIn(page, bob);
    await expect(page.locator(".pane-user-card")).toContainText(bob.userId);

    // Alice is listed for switching, and her notifications keep arriving while Bob is active.
    await page.getByTestId("user-card").click();
    await expect(page.getByTestId("switch-account")).toContainText(alice.userId);
    await page.keyboard.press("Escape");
    await page.clock.fastForward(6_000); // first check: marks "now"
    await sendMessage(carol, dm, "Mead tonight?");
    await expect
        .poll(
            async () => {
                await page.clock.fastForward(61_000);
                return page.evaluate(() =>
                    (window as unknown as { shownNotifications: Array<{ title: string; body: string }> }).shownNotifications.map(
                        ({ title, body }) => ({ title, body }),
                    ),
                );
            },
            { timeout: 30_000, intervals: [1_000] },
        )
        .toContainEqual({ title: "Carol (to Alice)", body: expect.stringMatching(/Mead tonight\?|New encrypted message/) });

    // Clicking it switches to Alice and opens the conversation.
    await page.evaluate(() =>
        (window as unknown as { shownNotifications: Array<{ title: string; click: () => void }> }).shownNotifications
            .find((notification) => notification.title === "Carol (to Alice)")
            ?.click(),
    );
    await waitForAppShell(page);
    await expect(page.locator(".pane-user-card")).toContainText(alice.userId);
    await expect(page.locator(".channel-header-title")).toContainText(/carol/i, { timeout: 30_000 });
    await page.getByTestId("user-card").click();
    await expect(page.getByTestId("switch-account")).toContainText(bob.userId);
    await page.keyboard.press("Escape");

    // Signing out of Alice carries on as Bob.
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator(".settings-button-danger").click();
    await expect(page.getByTestId("rail-home")).toBeHidden({ timeout: 30_000 });
    await waitForAppShell(page);
    await expect(page.locator(".pane-user-card")).toContainText(bob.userId);
    await page.getByTestId("user-card").click();
    await expect(page.getByTestId("switch-account")).toHaveCount(0);
});

test("changing your mind about adding an account goes back to the one you had", async ({ page }) => {
    const alice = await registerUser("alice");
    await signIn(page, alice);
    await page.getByTestId("user-card").click();
    await page.getByTestId("add-account").click();
    await page.getByTestId("back-to-account").click();
    await waitForAppShell(page);
    await expect(page.locator(".pane-user-card")).toContainText(alice.userId);
    await page.getByTestId("user-card").click();
    await expect(page.getByTestId("switch-account")).toHaveCount(0);
});
