// SPDX-License-Identifier: AGPL-3.0-only
// Deleted messages leave a "Message deleted" line saying who deleted them, instead of vanishing without a trace
// (the owner saw messages disappear from a DM and couldn't tell why).
import { expect, test } from "@playwright/test";

import { createRoom, joinRoom, redact, registerUser, sendEvent, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("deleted messages show who deleted them", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    const mine = await sendEvent(alice, dm, "m.room.message", { msgtype: "m.text", body: "my message" });
    const theirs = await sendEvent(bob, dm, "m.room.message", { msgtype: "m.text", body: "bob's own message" });
    await sendEvent(bob, dm, "m.room.message", { msgtype: "m.text", body: "still here" });
    // In a DM both people are admins, so Bob can delete Alice's message too.
    await redact(bob, dm, mine);
    await redact(bob, dm, theirs);

    await signIn(page, alice);
    await page.getByTestId("home-row").filter({ hasText: "Bob" }).click();
    const timeline = page.locator(".timeline");
    await expect(timeline).toContainText("still here");
    await expect(timeline.getByTestId("message-deleted")).toHaveText(["Message deleted by Bob", "Message deleted"]);
    await expect(timeline).not.toContainText("my message");
});
