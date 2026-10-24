// SPDX-License-Identifier: AGPL-3.0-only
// Servers like Discord: channel type icons, unread counts on channels and server icons, and the right-click menus on a
// server (mark as read, mute, notification settings, hide muted channels, move, per-server profile) and a channel.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, joinRoom, readState, registerUser, sendMessage, sendState, type ApiUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

async function space(owner: ApiUser, member: ApiUser, name: string, channels: Array<{ name: string; type?: string }>): Promise<{ spaceId: string; channelIds: string[] }> {
    const spaceId = await createRoom(owner, { name, preset: "private_chat", creation_content: { type: "m.space" }, invite: [member.userId] });
    const channelIds: string[] = [];
    for (const channel of channels) {
        const channelId = await createRoom(owner, {
            name: channel.name,
            preset: "private_chat",
            invite: [member.userId],
            initial_state: [
                { type: "m.space.parent", state_key: spaceId, content: { canonical: true, via: ["localhost"] } },
                ...(channel.type ? [{ type: "io.github.peytong.meadhall.channel_type", state_key: "", content: { type: channel.type } }] : []),
            ],
        });
        await sendState(owner, spaceId, "m.space.child", channelId, { via: ["localhost"], suggested: true });
        channelIds.push(channelId);
    }
    await joinRoom(member, spaceId);
    for (const channelId of channelIds) await joinRoom(member, channelId);
    return { spaceId, channelIds };
}

const channelRow = (page: Page, name: string) => page.locator(".room-item").filter({ hasText: name });
const rail = (page: Page, name: string) => page.locator(`.rail-icon[title="${name}"]`);

test("channel types show their icons; unread counts show on channels and on the server icon", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const { channelIds } = await space(bob, alice, "Mead Hall", [
        { name: "general" },
        { name: "rules", type: "rules" },
        { name: "faq", type: "faq" },
        { name: "news", type: "news" },
        { name: "events", type: "events" },
    ]);
    await signIn(page, alice);
    await rail(page, "Mead Hall").click();
    for (const name of ["general", "rules", "faq", "news", "events"]) await expect(channelRow(page, name).locator(".room-item-type-icon svg")).toBeVisible();

    await page.getByTestId("rail-home").click();
    await sendMessage(bob, channelIds[2]!, "one");
    await sendMessage(bob, channelIds[2]!, "two");
    await expect(rail(page, "Mead Hall").getByTestId("rail-badge")).toHaveText("2", { timeout: 20_000 });
    await rail(page, "Mead Hall").click();
    await expect(channelRow(page, "faq").locator(".room-item-unread")).toHaveText("2");
    if (process.env.PREVIEW_DIR) await page.locator(".channels-pane").screenshot({ path: `${process.env.PREVIEW_DIR}/channel-types.png` });
});

test("the server menu marks as read, mutes, hides muted channels, moves the server and sets a server nickname", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const hall = await space(bob, alice, "Great Hall", [{ name: "general" }, { name: "memes" }]);
    await space(bob, alice, "Another Hall", [{ name: "lobby" }]);
    await signIn(page, alice);
    await expect(rail(page, "Great Hall")).toBeVisible();
    await sendMessage(bob, hall.channelIds[1]!, "unread meme");
    await expect(rail(page, "Great Hall").getByTestId("rail-badge")).toHaveText("1", { timeout: 20_000 });

    // Mark as read.
    await rail(page, "Great Hall").click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Great Hall menu" });
    await expect(menu).toBeVisible();
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/server-menu.png` });
    await menu.getByTestId("space-menu-mark-read").click();
    await expect(rail(page, "Great Hall").getByTestId("rail-badge")).toHaveCount(0, { timeout: 20_000 });

    // Mute the server: no badge for new messages, channels shown muted.
    await rail(page, "Great Hall").click({ button: "right" });
    await page.getByRole("menu", { name: "Great Hall menu" }).getByTestId("space-menu-mute").click();
    await expect(rail(page, "Great Hall")).toHaveClass(/is-muted/, { timeout: 20_000 });
    await sendMessage(bob, hall.channelIds[0]!, "while muted");
    await rail(page, "Great Hall").click();
    await expect(channelRow(page, "general")).toHaveClass(/is-muted/, { timeout: 20_000 });
    await expect(channelRow(page, "general").locator(".room-item-unread")).toHaveCount(0);
    await expect(rail(page, "Great Hall").getByTestId("rail-badge")).toHaveCount(0);

    // Hide muted channels.
    await rail(page, "Great Hall").click({ button: "right" });
    await page.getByRole("menuitemcheckbox", { name: "Hide muted channels" }).click();
    await expect(channelRow(page, "memes")).toHaveCount(0);
    await rail(page, "Great Hall").click({ button: "right" });
    await page.getByRole("menuitemcheckbox", { name: "Hide muted channels" }).click();
    await expect(channelRow(page, "memes")).toBeVisible();

    // Unmute again.
    await rail(page, "Great Hall").click({ button: "right" });
    await page.getByRole("menu", { name: "Great Hall menu" }).getByTestId("space-menu-mute").click();
    await expect(rail(page, "Great Hall")).not.toHaveClass(/is-muted/, { timeout: 20_000 });

    // Move to the bottom of the rail.
    const order = async (): Promise<string[]> => page.locator(".rail-icon[data-space-id]").evaluateAll((icons) => icons.map((icon) => icon.getAttribute("title") ?? ""));
    expect((await order())[0]).toBe("Another Hall");
    await rail(page, "Another Hall").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to..." }).click();
    await page.getByRole("menuitem", { name: "Bottom" }).click();
    await expect.poll(order).toEqual(["Great Hall", "Another Hall"]);

    // Per-server profile.
    await rail(page, "Great Hall").click({ button: "right" });
    await page.getByTestId("space-menu-profile").click();
    const dialog = page.getByRole("dialog", { name: "Your profile in Great Hall" });
    await dialog.getByLabel("Server nickname").fill("Hall Alice");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await readState(bob, hall.spaceId, "m.room.member", alice.userId)).displayname).toBe("Hall Alice");
    expect((await readState(bob, hall.channelIds[0]!, "m.room.member", alice.userId)).displayname).toBe("Hall Alice");
});

test("a channel's menu mutes it and marks it as read", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const hall = await space(bob, alice, "Quiet Hall", [{ name: "general" }, { name: "spam" }]);
    await signIn(page, alice);
    await rail(page, "Quiet Hall").click();
    await sendMessage(bob, hall.channelIds[1]!, "spam 1");
    await expect(channelRow(page, "spam").locator(".room-item-unread")).toHaveText("1", { timeout: 20_000 });

    await channelRow(page, "spam").click({ button: "right" });
    const menu = page.getByRole("menu", { name: "spam channel menu" });
    await menu.getByRole("menuitem", { name: "Mark as read" }).click();
    await expect(channelRow(page, "spam").locator(".room-item-unread")).toHaveCount(0, { timeout: 20_000 });

    await channelRow(page, "spam").click({ button: "right" });
    await page.getByRole("menu", { name: "spam channel menu" }).getByTestId("channel-menu-mute").click();
    await expect(channelRow(page, "spam")).toHaveClass(/is-muted/, { timeout: 20_000 });
    await sendMessage(bob, hall.channelIds[1]!, "spam 2");
    await page.waitForTimeout(1500);
    await expect(channelRow(page, "spam").locator(".room-item-unread")).toHaveCount(0);
    await expect(rail(page, "Quiet Hall").getByTestId("rail-badge")).toHaveCount(0);
});

test("channel settings turn on text chat in a voice channel and change a channel's type", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    // Alice owns the server, so she may edit its channels.
    const hall = await space(alice, bob, "Settings Hall", [{ name: "general" }]);
    const voiceId = await createRoom(alice, {
        name: "Hangout",
        preset: "private_chat",
        initial_state: [
            { type: "m.space.parent", state_key: hall.spaceId, content: { canonical: true, via: ["localhost"] } },
            { type: "org.heorot.voice_channel", state_key: "", content: { enabled: true } },
        ],
    });
    await sendState(alice, hall.spaceId, "m.space.child", voiceId, { via: ["localhost"], "org.heorot.channel_type": "voice", "org.heorot.voice_channel": true });
    await signIn(page, alice);
    await rail(page, "Settings Hall").click();

    await channelRow(page, "Hangout").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit channel" }).click();
    await page.getByTestId("voice-chat-toggle").check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect.poll(async () => (await readState(alice, voiceId, "io.github.peytong.meadhall.voice_chat").catch(() => ({}))).enabled).toBe(true);

    await channelRow(page, "general").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit channel" }).click();
    await page.getByLabel("Channel type").selectOption("news");
    await page.getByRole("button", { name: "Save" }).click();
    await expect.poll(async () => (await readState(alice, hall.channelIds[0]!, "io.github.peytong.meadhall.channel_type").catch(() => ({}))).type).toBe("news");
    await expect.poll(async () => (await readState(alice, hall.spaceId, "m.space.child", hall.channelIds[0]!))["org.heorot.channel_type"]).toBe("news");
    await expect(channelRow(page, "general").locator(".room-item-type-icon svg")).toBeVisible();
});
