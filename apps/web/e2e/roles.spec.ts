// SPDX-License-Identifier: AGPL-3.0-only
// Server Settings -> Members & roles: create a role, give it to someone, and it reaches the server as power levels.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, readState, registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("owners create roles in the member browser and give them to members", async ({ page }) => {
    const owner = await registerUser("owner");
    const bob = await registerUser("bob");
    const { spaceId, channelId } = await createSpaceWithChannel(owner, bob, { space: "Hall", channel: "general" });
    await signIn(page, owner);
    await page.getByTitle("Hall").click();
    await page.getByRole("button", { name: "Server", exact: true }).click();
    await page.getByRole("button", { name: "Members", exact: true }).click();

    const roles = page.getByTestId("roles-section");
    await roles.getByRole("button", { name: "Create role" }).click();
    const editor = roles.locator(".roles-editor").last();
    await editor.locator("summary").click();
    await editor.getByLabel("Name").fill("Moderator");
    await editor.getByLabel(/^Rank/).fill("50");
    await editor.getByLabel("Kick members").check();
    await editor.getByRole("radio", { name: "Color #e67e22" }).click();
    await roles.getByRole("button", { name: "Save roles" }).click();
    await expect(page.getByText("Roles saved.")).toBeVisible({ timeout: 15_000 });

    const bobRow = page.getByTestId("members-section").locator(`[data-user-id="${bob.userId}"]`);
    await bobRow.getByRole("combobox", { name: /Give .* a role/ }).selectOption({ label: "Moderator" });
    await expect(bobRow.locator(".roles-chip", { hasText: "Moderator" })).toBeVisible({ timeout: 15_000 });
    if (process.env.PREVIEW_DIR) {
        await page.locator(".settings-content").screenshot({ path: `${process.env.PREVIEW_DIR}/roles-tab.png` });
    }

    await expect
        .poll(async () => ((await readState(owner, spaceId, "m.room.power_levels")).users as Record<string, number>)[bob.userId], { timeout: 15_000 })
        .toBe(50);
    await expect
        .poll(async () => (await readState(owner, channelId, "m.room.power_levels")).kick, { timeout: 15_000 })
        .toBe(50);
});
