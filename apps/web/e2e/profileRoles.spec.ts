// SPDX-License-Identifier: AGPL-3.0-only
// Profiles list the person's roles in every server you share, under each server's name.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, invite, joinRoom, readState, registerUser, sendMessage, sendState, setDisplayName, setPresence } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("a profile shows roles in each mutual server, with the server name", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const hall = await createSpaceWithChannel(bob, alice, { space: "Heorot", channel: "general" });
    const longhouse = await createSpaceWithChannel(bob, alice, { space: "Longhouse", channel: "lounge" });
    await sendState(bob, hall.spaceId, "io.github.peytong.meadhall.roles", "", {
        roles: [
            { id: "thane", name: "Thane", color: "#ffaa00", rank: 60, permissions: ["kick"] },
            { id: "skald", name: "Skald", color: "#33ccff", rank: 10, permissions: [] },
        ],
    });
    await sendState(bob, hall.spaceId, "io.github.peytong.meadhall.member_roles", `user:${bob.userId}`, { roles: ["thane", "skald"] });
    await sendMessage(bob, hall.channelId, "Welcome to the hall");
    void longhouse;

    await signIn(page, alice);
    await page.getByTitle("Heorot").click();
    await page.getByText("#general", { exact: true }).first().click();
    await page.locator(".timeline").getByText("Bob", { exact: true }).first().click();

    const card = page.getByTestId("profile-roles");
    await expect(card).toBeVisible();
    const heorot = card.locator(".rp-server-roles").filter({ hasText: "Heorot" });
    await expect(heorot.locator(".rp-role-chip")).toHaveText(["Thane", "Skald"]);
    // A server without Meadhall roles shows the Matrix power level: Bob created it, so Admin.
    await expect(card.locator(".rp-server-roles").filter({ hasText: "Longhouse" }).locator(".rp-role-chip")).toHaveText(["Admin"]);
    if (process.env.PREVIEW_DIR) {
        await card.screenshot({ path: `${process.env.PREVIEW_DIR}/profile-roles.png` });
    }
});

test("the members list groups people by their top role, highest rank first, and admins change roles from it", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const carol = await registerUser("carol");
    await setDisplayName(bob, "Bob");
    await setDisplayName(carol, "Carol");
    // Alice owns the server, so she may manage roles.
    const hall = await createSpaceWithChannel(alice, bob, { space: "Rank Hall", channel: "general" });
    await inviteAndJoin(alice, carol, hall.spaceId, hall.channelId);
    await sendState(alice, hall.spaceId, "io.github.peytong.meadhall.roles", "", {
        roles: [
            { id: "skald", name: "Skald", color: "#33ccff", rank: 10, permissions: [] },
            { id: "thane", name: "Thane", color: "#ffaa00", rank: 60, permissions: ["kick"] },
        ],
    });
    await sendState(alice, hall.spaceId, "io.github.peytong.meadhall.member_roles", `user:${bob.userId}`, { roles: ["thane"] });
    await setPresence(bob, "online");
    await setPresence(carol, "online");

    await signIn(page, alice);
    await page.getByTitle("Rank Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    const membersButton = page.getByRole("button", { name: "Members panel" });
    if (!/is-active/.test((await membersButton.getAttribute("class")) ?? "")) await membersButton.click();
    const titles = page.locator(".rs-members-group-title");
    await expect(titles.first()).toHaveText("Thane — 1", { timeout: 20_000 });
    await expect(page.locator(".rs-member-row").first()).toContainText("Bob");

    const carolRow = page.locator(`.rs-member-row[data-user-id="${carol.userId}"]`);
    await carolRow.click({ button: "right" });
    await page.getByTestId("member-menu-roles").click();
    await page.getByRole("menuitemcheckbox", { name: "Skald" }).click();
    await expect.poll(async () => (await readState(alice, hall.spaceId, "io.github.peytong.meadhall.member_roles", `user:${carol.userId}`).catch(() => ({ roles: null }))).roles, { timeout: 20_000 }).toEqual(["skald"]);
    await expect(titles.filter({ hasText: "Skald" })).toHaveText("Skald — 1", { timeout: 20_000 });
    // Thane (rank 60) stays above Skald (rank 10).
    await expect(titles).toContainText(["Thane — 1", "Skald — 1"]);
    if (process.env.PREVIEW_DIR) await page.locator(".rs-panel").screenshot({ path: `${process.env.PREVIEW_DIR}/members-by-role.png` });
});

async function inviteAndJoin(owner: Parameters<typeof sendState>[0], member: Parameters<typeof sendState>[0], spaceId: string, channelId: string): Promise<void> {
    for (const roomId of [spaceId, channelId]) {
        await invite(owner, roomId, member.userId);
        await joinRoom(member, roomId);
    }
}
