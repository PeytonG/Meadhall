// SPDX-License-Identifier: AGPL-3.0-only
// Status like Discord: the user-panel menu sets presence, custom status and DND; the DM list shows status and the
// latest message; people on the mobile app show a green phone.
import { expect, test } from "@playwright/test";

import {
    createRoom,
    createSpaceWithChannel,
    joinRoom,
    readPresence,
    readProfileField,
    registerUser,
    sendMessage,
    setAccountData,
    setDisplayName,
    setPresence,
    setProfileField,
} from "./support/matrixApi";
import { signIn } from "./support/ui";

const STATUS_KEY = "io.github.peytong.meadhall.status";

test("the status menu sets Do Not Disturb and a custom status, visible to others", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    // Synapse only shares presence between people with a room in common.
    const hall = await createRoom(bob, { name: "Hall", invite: [alice.userId] });
    await joinRoom(alice, hall);
    await signIn(page, alice);

    await page.getByTestId("user-card").click();
    const menu = page.getByRole("menu", { name: "Set status" });
    await menu.getByTestId("status-text").fill("Feasting in the hall");
    await menu.getByRole("menuitemradio", { name: /Do Not Disturb/ }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator(".pane-user-card .avatar-presence-dot")).toHaveClass(/is-dnd/);
    await expect(page.locator(".pane-user-id")).toHaveText("Feasting in the hall");

    // Other apps (Element) see Idle with the text; Meadhall reads DND from the profile field.
    await expect.poll(async () => readPresence(bob, alice.userId), { timeout: 30_000 }).toMatchObject({
        presence: "unavailable",
        status_msg: "Feasting in the hall",
    });
    await expect.poll(() => readProfileField(bob, alice.userId, STATUS_KEY).catch(() => null), { timeout: 15_000 }).toMatchObject({ state: "dnd" });
});

test("the DM list shows status and the latest message, and a phone for people on mobile", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await sendMessage(bob, dm, "Fireside at sundown?");
    // Bob is on the Android app with no manual status, and has a custom status.
    await setProfileField(bob, STATUS_KEY, { state: null, platform: "mobile" });
    await setPresence(bob, "online", "At sea");
    await signIn(page, alice);

    const row = page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: "Bob" });
    await expect(row).toContainText("At sea · Fireside at sundown?", { timeout: 15_000 });
    await expect(row.locator(".avatar-presence-dot")).toHaveClass(/is-mobile/, { timeout: 15_000 });

    await row.click();
    await page.getByPlaceholder(/^Message /).fill("On my way");
    await page.getByPlaceholder(/^Message /).press("Enter");
    await expect(row).toContainText("You: On my way");
});

test("Automatic status goes Away after 10 minutes without input, and back to Online on return", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const hall = await createRoom(bob, { name: "Hall", invite: [alice.userId] });
    await joinRoom(alice, hall);
    await page.clock.install();
    await signIn(page, alice);
    const dot = page.locator(".pane-user-card .avatar-presence-dot");
    await expect(dot).toHaveClass(/is-online/);

    await page.clock.fastForward("10:30");
    await expect(dot).toHaveClass(/is-idle/);
    await expect.poll(async () => (await readPresence(bob, alice.userId)).presence, { timeout: 30_000 }).toBe("unavailable");

    await page.mouse.move(200, 200);
    await page.mouse.move(260, 240);
    await expect(dot).toHaveClass(/is-online/);
    await expect.poll(async () => (await readPresence(bob, alice.userId)).presence, { timeout: 30_000 }).toBe("online");
});

test("someone playing a game shows Playing ... in the DM list", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await setProfileField(bob, STATUS_KEY, { state: null, platform: "desktop", activity: { name: "Stardew Valley", since: Date.now() } });
    await setPresence(bob, "online");
    await signIn(page, alice);

    const row = page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: "Bob" });
    await expect(row).toContainText("Playing Stardew Valley", { timeout: 15_000 });
});

test("what someone is playing shows under their name in the member list and on their profile", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const { spaceId, channelId } = await createSpaceWithChannel(bob, alice, { space: "Hall", channel: "general" });
    void spaceId;
    await sendMessage(bob, channelId, "brb, one more race");
    // As Meadhall publishes it: presence text plus the profile field.
    await setProfileField(bob, STATUS_KEY, { state: null, platform: "desktop", activity: { name: "BeamNG.drive", since: Date.now() } });
    await setPresence(bob, "online", "Playing BeamNG.drive");
    await signIn(page, alice);
    await page.getByTitle("Hall").click();
    await page.getByText("#general", { exact: true }).first().click();

    const bobRow = page.locator(".rs-member-row", { hasText: "Bob" }).first();
    await expect(bobRow.locator(".rs-member-id")).toHaveText("Playing BeamNG.drive", { timeout: 15_000 });
    await page.locator(".timeline").getByText("Bob", { exact: true }).first().click();
    await expect(page.getByTestId("presence-status-text").first()).toHaveText("Playing BeamNG.drive");
});

test("status changes reach other people within seconds", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await setPresence(bob, "online");
    await signIn(page, alice);
    const row = page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: "Bob" });
    await expect(row.locator(".avatar-presence-dot")).toHaveClass(/is-online/, { timeout: 15_000 });

    // Bob goes Do Not Disturb with a status, as Meadhall does it (timed from when the server accepted it).
    await setProfileField(bob, STATUS_KEY, { state: "dnd", platform: "desktop" });
    await setPresence(bob, "unavailable", "In a meeting");
    const started = Date.now();
    await expect(row).toContainText("In a meeting", { timeout: 10_000 });
    await expect(row.locator(".avatar-presence-dot")).toHaveClass(/is-dnd/, { timeout: 10_000 });
    expect(Date.now() - started).toBeLessThan(10_000);
});
