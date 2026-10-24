// SPDX-License-Identifier: AGPL-3.0-only
// The top bar: an inbox of unread messages (unreads or just mentions, jump there, mark read) and a download arrow
// when an update is out, like Discord's.
import { expect, test } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("the inbox lists unread messages by conversation, filters mentions, jumps there and marks read", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const { channelId } = await createSpaceWithChannel(bob, alice, { space: "Inbox Hall", channel: "general" });
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    const elsewhere = await createRoom(bob, { name: "Elsewhere", invite: [alice.userId] });
    await joinRoom(alice, elsewhere);
    await signIn(page, alice);
    // Somewhere else is open, so the new messages stay unread.
    await page.getByTestId("home-row").filter({ hasText: "Elsewhere" }).click();

    await sendMessage(bob, channelId, "Feast at dusk");
    await sendMessage(bob, channelId, `${alice.username}: bring the mead`);
    await sendMessage(bob, dm, "Psst, a secret");
    const inboxButton = page.getByTestId("header-inbox");
    await expect(inboxButton).toContainText("3", { timeout: 20_000 });

    await inboxButton.click();
    const inbox = page.getByTestId("inbox-panel");
    await expect(inbox.getByTestId("inbox-conversation")).toHaveCount(2);
    await expect(inbox).toContainText("#general · Inbox Hall");
    await expect(inbox).toContainText("Feast at dusk");
    await expect(inbox).toContainText("Psst, a secret");
    if (process.env.PREVIEW_DIR) await inbox.screenshot({ path: `${process.env.PREVIEW_DIR}/inbox.png` });

    // Mentions only: the message naming Alice.
    await inbox.getByRole("tab", { name: "Mentions" }).click();
    await expect(inbox.getByTestId("inbox-conversation")).toHaveCount(1);
    await expect(inbox).toContainText("bring the mead");
    await expect(inbox).not.toContainText("Psst, a secret");

    // Jump to the conversation.
    await inbox.getByRole("tab", { name: "Unreads" }).click();
    await inbox.getByText("Psst, a secret").click();
    await expect(inbox).toBeHidden();
    await expect(page.locator(".timeline")).toContainText("Psst, a secret");

    // Mark everything read.
    await inboxButton.click();
    await page.getByTestId("inbox-panel").getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByTestId("inbox-panel")).toContainText("You're all caught up!", { timeout: 20_000 });
    await expect(inboxButton).not.toContainText(/\d/);
});

test("a download arrow appears in the top bar when an update is out", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await page.addInitScript(() => {
        (window as unknown as { Capacitor: unknown }).Capacitor = { getPlatform: () => "android", isNativePlatform: () => true };
    });
    await page.route("https://api.github.com/repos/PeytonG/Meadhall/releases/latest", (route) =>
        route.fulfill({ json: { tag_name: "v9.9.9", html_url: "https://github.com/PeytonG/Meadhall/releases/tag/v9.9.9", assets: [] } }),
    );
    await signIn(page, alice);
    await page.getByTestId("home-row").first().click();
    const update = page.getByTestId("header-update");
    await expect(update).toBeVisible({ timeout: 20_000 });
    await update.click();
    await expect(page.getByTestId("mobile-updates")).toBeVisible();
});
