// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Report a bug: sent from the reporter's account to the developer, who is never named in the UI; the
// report's room never shows in the reporter's room list and is left once the developer has joined it.
import { expect, test } from "@playwright/test";

import { SYNAPSE_URL, joinRoom, readMessages, readState, registerUser, type ApiUser } from "./support/matrixApi";
import { signIn, waitForAppShell } from "./support/ui";

// A 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function invitedRooms(user: ApiUser): Promise<string[]> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/sync?timeout=0`, { headers: { Authorization: `Bearer ${user.accessToken}` } });
    const body = (await response.json()) as { rooms?: { invite?: Record<string, unknown> } };
    return Object.keys(body.rooms?.invite ?? {});
}

async function joinedRooms(user: ApiUser): Promise<string[]> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/joined_rooms`, { headers: { Authorization: `Bearer ${user.accessToken}` } });
    return ((await response.json()) as { joined_rooms: string[] }).joined_rooms;
}

test("a bug report reaches the developer and disappears for the reporter", async ({ page }) => {
    const developer = await registerUser("dev");
    const alice = await registerUser("alice");
    await page.route("**/config.127.0.0.1.json*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...(await response.json()), bug_report_recipient: developer.userId } });
    });
    await signIn(page, alice);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Report a bug", exact: true }).click();

    const tab = page.getByTestId("bug-report-tab");
    await expect(tab).not.toContainText(developer.userId);
    await expect(tab).not.toContainText(developer.username);
    await expect(tab.getByRole("button", { name: "Send report" })).toBeDisabled();
    await tab.getByLabel("What kind of problem?").selectOption("Calls & voice");
    await tab.getByLabel("What happened?").fill("The call dropped after two minutes.");
    await tab.getByLabel(/Screenshot/).setInputFiles({ name: "screenshot.png", mimeType: "image/png", buffer: PNG });
    await expect(tab.getByRole("img", { name: "Screenshot to send" })).toBeVisible();
    if (process.env.PREVIEW_DIR) await tab.screenshot({ path: `${process.env.PREVIEW_DIR}/bug-report.png` });
    await tab.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByTestId("bug-report-sent")).toBeVisible();

    // The developer is invited to a room named for the report, holding the report and the screenshot.
    await expect.poll(() => invitedRooms(developer)).toHaveLength(1);
    const [roomId] = await invitedRooms(developer);
    await joinRoom(developer, roomId);
    const messages = await readMessages(developer, roomId);
    expect(messages.every((message) => message.sender === alice.userId)).toBe(true);
    const report = messages.find((message) => message.body.startsWith("🐞 Meadhall bug report"));
    expect(report?.body).toContain("Category: Calls & voice");
    expect(report?.body).toContain("The call dropped after two minutes.");
    expect(report?.body).toContain("Version:");
    expect(messages.some((message) => message.body === "screenshot.png")).toBe(true);
    expect((await readState(developer, roomId, "m.room.name")).name).toBe("Meadhall bug report");

    // Once the developer has joined, the reporter's client leaves the room; it never appeared in their list.
    await page.keyboard.press("Escape");
    await expect.poll(() => joinedRooms(alice), { timeout: 20_000 }).not.toContain(roomId);
    await expect(page.getByText("Meadhall bug report")).toHaveCount(0);
});

test("the developer sees reports under Home → Bug reports in Meadhall, joined automatically", async ({ page, browser }) => {
    const developer = await registerUser("dev");
    const alice = await registerUser("alice");
    const pointAtDeveloper = async (target: typeof page): Promise<void> => {
        await target.route("**/config.127.0.0.1.json*", async (route) => {
            const response = await route.fetch();
            await route.fulfill({ response, json: { ...(await response.json()), bug_report_recipient: developer.userId } });
        });
    };
    await pointAtDeveloper(page);
    await signIn(page, alice);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Report a bug", exact: true }).click();
    const tab = page.getByTestId("bug-report-tab");
    await tab.getByLabel("What kind of problem?").selectOption("Screen sharing");
    await tab.getByLabel("What happened?").fill("The previews are black.");
    await tab.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByTestId("bug-report-sent")).toBeVisible();

    const devPage = await (await browser.newContext()).newPage();
    await signIn(devPage, developer);
    const reports = devPage.getByRole("region", { name: "Bug reports" });
    const row = reports.getByTestId("home-row").filter({ hasText: "Meadhall bug report" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(`From ${alice.username}`);
    if (process.env.PREVIEW_DIR) await devPage.locator(".home-sidebar").screenshot({ path: `${process.env.PREVIEW_DIR}/bug-reports-inbox.png` });
    await row.click();
    await expect(devPage.locator(".timeline")).toContainText("The previews are black.");
    await expect(devPage.getByRole("region", { name: "Group chats" })).not.toContainText("Meadhall bug report");

    // The reporter's copy goes away once it's delivered; the developer's stays.
    await expect.poll(() => joinedRooms(alice), { timeout: 20_000 }).toHaveLength(0);
    await devPage.reload();
    await waitForAppShell(devPage);
    await expect(devPage.getByRole("region", { name: "Bug reports" }).getByTestId("home-row")).toHaveCount(1, { timeout: 20_000 });
});
