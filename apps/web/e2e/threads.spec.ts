// SPDX-License-Identifier: AGPL-3.0-only
// Threads: replies other apps and bots (baibot, Element) send "in a thread" show as "N replies" under the message
// and open beside the chat, where you can answer in the thread; the inbox lists them and marking read clears them.
import { expect, test } from "@playwright/test";

import { createRoom, joinRoom, readEvents, registerUser, sendEvent, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

function threadReply(rootId: string, body: string): Record<string, unknown> {
    return {
        msgtype: "m.text",
        body,
        "m.relates_to": { rel_type: "m.thread", event_id: rootId, is_falling_back: true, "m.in_reply_to": { event_id: rootId } },
    };
}

test("thread replies show under their message, open beside the chat, and can be answered there", async ({ page }) => {
    const alice = await registerUser("alice");
    const bot = await registerUser("bot");
    await setDisplayName(bot, "Mead Bot");
    const dm = await createRoom(alice, { is_direct: true, preset: "trusted_private_chat", invite: [bot.userId] });
    await joinRoom(bot, dm);
    await setAccountData(alice, "m.direct", { [bot.userId]: [dm] });
    const rootId = await sendEvent(alice, dm, "m.room.message", { msgtype: "m.text", body: "What goes with mead?" });
    await sendEvent(bot, dm, "m.room.message", threadReply(rootId, "Roast boar, mostly."));

    await signIn(page, alice);
    await page.getByTestId("home-row").filter({ hasText: "Mead Bot" }).click();
    const timeline = page.locator(".main-chat-stack .timeline");
    const mainMessages = timeline.locator(".timeline-body");
    await expect(timeline).toContainText("What goes with mead?");
    // The reply isn't a message in the main chat, but the message it answers says it has one.
    await expect(mainMessages.filter({ hasText: "Roast boar, mostly." })).toHaveCount(0);
    const summary = timeline.getByTestId("thread-summary");
    await expect(summary).toContainText("1 reply", { timeout: 20_000 });
    await expect(summary).toContainText("Roast boar, mostly.");

    await summary.click();
    const panel = page.getByTestId("thread-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".timeline")).toContainText("What goes with mead?");
    await expect(panel.locator(".timeline")).toContainText("Roast boar, mostly.");
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/thread.png` });

    // Answer in the thread: it goes to the thread, not the main chat.
    const threadBox = panel.getByPlaceholder("Reply in thread");
    await threadBox.fill("And honey cakes");
    await threadBox.press("Enter");
    await expect(panel.locator(".timeline")).toContainText("And honey cakes");
    await expect(summary).toContainText("2 replies");
    await expect(mainMessages.filter({ hasText: "And honey cakes" })).toHaveCount(0);
    await expect
        .poll(async () => {
            const events = await readEvents(bot, dm);
            const mine = events.find((event) => (event.content as { body?: string }).body === "And honey cakes");
            return (mine?.content as { "m.relates_to"?: { rel_type?: string; event_id?: string } } | undefined)?.["m.relates_to"];
        })
        .toMatchObject({ rel_type: "m.thread", event_id: rootId });

    // Start a thread on another message from its hover menu.
    await page.getByTestId("thread-panel").getByRole("button", { name: "Close thread" }).click();
    await expect(panel).toBeHidden();
    await sendEvent(bot, dm, "m.room.message", { msgtype: "m.text", body: "Anything else?" });
    const other = timeline.locator(".timeline-event").filter({ hasText: "Anything else?" });
    await other.hover();
    await other.getByRole("button", { name: "Reply in thread" }).click();
    await expect(panel).toBeVisible();
    await expect(panel.locator(".timeline")).toContainText("Anything else?");
});

test("the inbox lists thread replies, opens their thread, and marking read clears them", async ({ page }) => {
    const alice = await registerUser("alice");
    const bot = await registerUser("bot");
    await setDisplayName(bot, "Mead Bot");
    const dm = await createRoom(alice, { is_direct: true, preset: "trusted_private_chat", invite: [bot.userId] });
    await joinRoom(bot, dm);
    await setAccountData(alice, "m.direct", { [bot.userId]: [dm] });
    const elsewhere = await createRoom(alice, { name: "Elsewhere" });
    const rootId = await sendEvent(alice, dm, "m.room.message", { msgtype: "m.text", body: "Tell me a tale" });

    await signIn(page, alice);
    // Somewhere else is open, so the replies stay unread.
    await page.getByTestId("home-row").filter({ hasText: "Elsewhere" }).click();
    expect(elsewhere).toBeTruthy();
    await sendEvent(bot, dm, "m.room.message", threadReply(rootId, "Once, in a hall of gold..."));
    await sendEvent(bot, dm, "m.room.message", threadReply(rootId, "...there was a dragon."));

    const inboxButton = page.getByTestId("header-inbox");
    await expect(inboxButton).toContainText("2", { timeout: 20_000 });
    await inboxButton.click();
    const inbox = page.getByTestId("inbox-panel");
    await expect(inbox).toContainText("there was a dragon.");
    await expect(inbox).toContainText("in a thread");

    // Open the thread from the inbox.
    await inbox.getByText("there was a dragon.").click();
    await expect(page.getByTestId("thread-panel").locator(".timeline")).toContainText("Once, in a hall of gold...");
    // Reading the thread marks it read.
    await expect(inboxButton).not.toContainText(/\d/, { timeout: 20_000 });

    // New replies while the thread is closed and another chat is open: the ✓ in the inbox clears them.
    await page.getByTestId("thread-panel").getByRole("button", { name: "Close thread" }).click();
    await page.getByTestId("home-row").filter({ hasText: "Elsewhere" }).click();
    await sendEvent(bot, dm, "m.room.message", threadReply(rootId, "The end."));
    await expect(inboxButton).toContainText("1", { timeout: 20_000 });
    await inboxButton.click();
    await inbox.getByRole("button", { name: /^Mark .* as read$/ }).click();
    await expect(inbox).toContainText("You're all caught up!");
    await expect(inboxButton).not.toContainText(/\d/, { timeout: 20_000 });
    // And it stays cleared (the server agrees), after the inbox is reopened.
    await page.keyboard.press("Escape");
    await inboxButton.click();
    await expect(page.getByTestId("inbox-panel")).toContainText("You're all caught up!");
});
