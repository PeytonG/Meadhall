// SPDX-License-Identifier: AGPL-3.0-only
// Meadhall links (meadhall://room/<room>/<event>) in a message show a preview of what they point at, and open it
// in Meadhall at that message; links to conversations you're not in say so.
import { expect, test } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, sendMessage, sendState, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

const link = (roomId: string, eventId?: string): string =>
    `meadhall://room/${encodeURIComponent(roomId)}${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;

test("a Meadhall message link shows a preview and opens the message", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const carol = await registerUser("carol");
    await setDisplayName(alice, "Alice");
    await setDisplayName(bob, "Bob");
    const { spaceId, channelId } = await createSpaceWithChannel(alice, bob, { space: "Link Hall", channel: "general" });
    const otherId = await createRoom(alice, { name: "the-tavern", preset: "private_chat", invite: [bob.userId], initial_state: [{ type: "m.space.parent", state_key: spaceId, content: { canonical: true, via: ["localhost"] } }] });
    await sendState(alice, spaceId, "m.space.child", otherId, { via: ["localhost"] });
    await joinRoom(bob, otherId);
    // A message in the tavern, linked from general; and a link to a room Bob isn't in.
    const response = await fetch(`http://localhost:8008/_matrix/client/v3/rooms/${encodeURIComponent(otherId)}/send/m.room.message/t1`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${alice.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "m.text", body: "The mead is ready in the tavern" }),
    });
    const { event_id: eventId } = (await response.json()) as { event_id: string };
    const secret = await createRoom(carol, { name: "Carol's room", preset: "private_chat" });
    await sendMessage(alice, channelId, `Look at this ${link(otherId, eventId)}`);
    await sendMessage(alice, channelId, `And this ${link(secret)}`);

    await signIn(page, bob);
    await page.getByTitle("Link Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    const previews = page.getByTestId("app-link-preview");
    await expect(previews.first()).toContainText("Alice");
    await expect(previews.first()).toContainText("The mead is ready in the tavern");
    await expect(previews.first()).toContainText("the-tavern · Link Hall");
    await expect(previews.nth(1)).toContainText("A conversation you're not in");

    // Opens in Meadhall, at the message.
    await previews.first().click();
    await expect(page.locator(".channel-header")).toContainText("the-tavern");
    await expect(page.locator(".timeline").getByText("The mead is ready in the tavern")).toBeVisible();
});
