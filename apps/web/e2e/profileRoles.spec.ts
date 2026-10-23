// SPDX-License-Identifier: AGPL-3.0-only
// Profiles list the person's roles in every server you share, under each server's name.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, registerUser, sendMessage, sendState, setDisplayName } from "./support/matrixApi";
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
