// SPDX-License-Identifier: AGPL-3.0-only
// Home → Friends: Alice adds Bob by Matrix ID, Bob accepts under Pending, and both see each other under All.
import { expect, test } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("friend requests go out, get accepted and show on both sides", async ({ page, browser }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");

    await signIn(page, alice);
    await page.getByTestId("home-friends").click();
    const friends = page.getByTestId("friends-view");
    await friends.getByRole("button", { name: "Add Friend" }).click();
    await friends.getByLabel("Friend's Matrix ID").fill(bob.userId);
    await friends.getByRole("button", { name: "Send Friend Request" }).click();
    await friends.getByRole("button", { name: "Pending" }).click();
    await expect(friends.locator(`[data-user-id="${bob.userId}"]`)).toContainText("Outgoing friend request");

    const bobPage = await (await browser.newContext()).newPage();
    await signIn(bobPage, bob);
    const bobFriends = bobPage.getByTestId("friends-view");
    // The request shows as a count on Friends.
    await expect(bobPage.getByTestId("home-friends")).toContainText("1", { timeout: 30_000 });
    await bobPage.getByTestId("home-friends").click();
    await bobFriends.getByRole("button", { name: /Pending/ }).click();
    const request = bobFriends.locator(`[data-user-id="${alice.userId}"]`);
    await expect(request).toContainText("Incoming friend request");
    await request.getByTestId("friend-accept").click();
    await bobFriends.getByRole("button", { name: "All", exact: true }).click();
    await expect(bobFriends.locator(`[data-user-id="${alice.userId}"]`)).toBeVisible();

    await friends.getByRole("button", { name: "All", exact: true }).click();
    await expect(friends.locator(`[data-user-id="${bob.userId}"]`)).toBeVisible({ timeout: 30_000 });
});
