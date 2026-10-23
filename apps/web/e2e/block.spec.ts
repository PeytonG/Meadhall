// SPDX-License-Identifier: AGPL-3.0-only
// Block / Ignore: Matrix's ignore list, so the server stops sending the person's messages; the app hides what was
// already loaded, and Settings → Privacy lists blocked people to unblock.
import { expect, test } from "@playwright/test";

import { createRoom, joinRoom, readAccountData, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("blocking hides someone's messages everywhere, and unblocking from Privacy brings them back", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const carol = await registerUser("carol");
    await setDisplayName(bob, "Bob");
    await setDisplayName(carol, "Carol");
    const group = await createRoom(carol, { name: "Longhouse", preset: "private_chat", invite: [alice.userId, bob.userId] });
    await joinRoom(alice, group);
    await joinRoom(bob, group);
    await setAccountData(alice, "m.direct", { [carol.userId]: [group] });
    await sendMessage(bob, group, "bob was here");
    await sendMessage(carol, group, "carol was here");
    await signIn(page, alice);
    await page.getByRole("region", { name: /Group chats|Direct messages/ }).getByText("Longhouse").first().click();
    const timeline = page.locator(".timeline");
    await expect(timeline.getByText("bob was here")).toBeVisible();

    await timeline.getByText("Bob", { exact: true }).first().click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("profile-block").click();
    await expect(page.getByText("Blocked Bob.")).toBeVisible();
    await expect(page.getByTestId("profile-block")).toHaveText("Unblock");
    // Stored in Matrix's ignore list (the server enforces it).
    await expect
        .poll(async () => Object.keys(((await readAccountData(alice, "m.ignored_user_list")).ignored_users ?? {}) as object))
        .toEqual([bob.userId]);
    await expect(timeline.getByText("bob was here")).toBeHidden();
    await expect(timeline.getByText("carol was here")).toBeVisible();
    await sendMessage(bob, group, "can you hear me?");
    await sendMessage(carol, group, "still here");
    await expect(timeline.getByText("still here")).toBeVisible({ timeout: 20_000 });
    await expect(timeline.getByText("can you hear me?")).toBeHidden();

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Privacy & Safety", exact: true }).click();
    const blocked = page.getByTestId("blocked-users");
    await expect(blocked).toContainText(bob.userId);
    await blocked.getByRole("button", { name: "Unblock" }).click();
    await expect(blocked).toContainText("You haven't blocked anyone.");
    await expect
        .poll(async () => Object.keys(((await readAccountData(alice, "m.ignored_user_list")).ignored_users ?? {}) as object))
        .toEqual([]);
});
