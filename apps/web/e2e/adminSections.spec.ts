// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Server admin sections beyond tokens, accounts and notices (admin/AdminSections.tsx), against the real
// Synapse Admin API: a user's details (lock, devices), rooms (details, directory), federation, overview, media.
import { expect, test, type Page } from "@playwright/test";

import { SYNAPSE_URL, createRoom, registerAdmin, registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

async function openSection(page: Page, name: string): Promise<void> {
    await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name, exact: true }).click();
}

async function canLogIn(username: string, password: string): Promise<boolean> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: username }, password }),
    });
    return response.ok;
}

test("admins open a user's details, lock them and see their devices", async ({ page }) => {
    const admin = await registerAdmin("admin");
    const carol = await registerUser("carol");
    await signIn(page, admin);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Server admin", exact: true }).click();

    const users = page.getByTestId("admin-users");
    await users.getByLabel("Search users").fill(carol.username);
    const row = users.locator(`[data-user-id^="@${carol.username}:"]`);
    await row.getByRole("button", { name: "Details" }).click();

    const detail = page.getByTestId("admin-user-detail");
    await expect(detail.getByLabel("User ID")).toHaveValue(carol.userId);
    await detail.getByLabel(/^Locked/).check();
    await detail.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => canLogIn(carol.username, carol.password)).toBe(false);

    await detail.getByRole("tab", { name: "Devices" }).click();
    await expect(detail.getByRole("table", { name: "Devices" }).getByRole("button", { name: "Sign out" }).first()).toBeVisible();
    await detail.getByRole("tab", { name: "Connections" }).click();
    await expect(detail.getByRole("table", { name: "Connections" })).toBeVisible();

    await detail.getByRole("tab", { name: "User" }).click();
    await detail.getByLabel(/^Locked/).uncheck();
    await detail.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => canLogIn(carol.username, carol.password)).toBe(true);
});

test("admins see rooms, the directory, federation and the overview", async ({ page }) => {
    const admin = await registerAdmin("admin");
    const dave = await registerUser("dave");
    const name = `Listed ${Date.now().toString(36)}`;
    const roomId = await createRoom(dave, { name, preset: "public_chat", visibility: "public" });
    await signIn(page, admin);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Server admin", exact: true }).click();

    await openSection(page, "Overview");
    await expect(page.getByTestId("admin-overview")).toContainText("Synapse");

    await openSection(page, "Rooms");
    const rooms = page.getByTestId("admin-rooms");
    await rooms.getByLabel("Search rooms").fill(name);
    await rooms.getByRole("row").filter({ hasText: name }).click();
    const detail = page.getByTestId("admin-room-detail");
    await expect(detail).toContainText(roomId);
    await expect(detail).toContainText(dave.userId);

    await openSection(page, "Room directory");
    const directory = page.getByTestId("admin-directory");
    // The test Synapse keeps its default room_list_publication_rules (nobody may publish): the panel says how to allow it.
    await directory.getByLabel("Room ID to list").fill(roomId);
    await directory.getByRole("button", { name: "Add to directory" }).click();
    await expect(page.getByText(/room_list_publication_rules/)).toBeVisible();

    await openSection(page, "Federation");
    await expect(page.getByTestId("admin-federation").getByRole("table", { name: "Federation" })).toBeVisible();
    await openSection(page, "Users' media");
    await expect(page.getByTestId("admin-media").getByRole("button", { name: "Purge remote cache" })).toBeVisible();
    await openSection(page, "Reported events");
    await expect(page.getByTestId("admin-event-reports")).toBeVisible();
});
