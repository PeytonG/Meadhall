// SPDX-License-Identifier: AGPL-3.0-only
// Settings -> Server admin: only server admins see it; tokens and account actions really happen on the server.
import { expect, test, type Page } from "@playwright/test";

import { SYNAPSE_URL, registerAdmin, registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

async function canLogIn(username: string, password: string): Promise<boolean> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: username }, password }),
    });
    return response.ok;
}

async function tokenValid(token: string): Promise<boolean> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v1/register/m.login.registration_token/validity?token=${encodeURIComponent(token)}`);
    return ((await response.json()) as { valid: boolean }).valid;
}

async function openAdmin(page: Page): Promise<void> {
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Server admin", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Server admin" })).toBeVisible();
}

test("people who aren't server admins don't get the admin tab", async ({ page }) => {
    const alice = await registerUser("alice");
    await signIn(page, alice);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await expect(page.getByRole("button", { name: "Appearance", exact: true })).toBeVisible();
    await page.waitForTimeout(1_500); // the admin check has had time to answer
    await expect(page.getByRole("button", { name: "Server admin", exact: true })).toHaveCount(0);
});

test("admins create and delete registration tokens", async ({ page }) => {
    const admin = await registerAdmin("admin");
    await signIn(page, admin);
    await openAdmin(page);

    const tokens = page.getByTestId("admin-tokens");
    await tokens.getByLabel("Uses (blank = unlimited)").fill("2");
    await tokens.getByRole("button", { name: "Create token" }).click();
    const token = (await page.getByTestId("admin-new-token").textContent())!.trim();
    expect(token.length).toBeGreaterThan(5);
    expect(await tokenValid(token)).toBe(true);
    await expect(tokens.getByRole("row").filter({ hasText: token })).toContainText("Used 0 of 2");

    page.once("dialog", (dialog) => void dialog.accept());
    await tokens.getByRole("row").filter({ hasText: token }).getByRole("button", { name: "Delete" }).click();
    await expect(tokens.getByRole("row").filter({ hasText: token })).toHaveCount(0);
    expect(await tokenValid(token)).toBe(false);
});

test("admins create accounts, reset passwords, grant admin and deactivate", async ({ page }) => {
    const admin = await registerAdmin("admin");
    await signIn(page, admin);
    await openAdmin(page);
    const users = page.getByTestId("admin-users");

    // Create an account and sign in with it.
    const username = `made${Date.now().toString(36)}`;
    await users.getByLabel("Username").fill(username);
    await users.getByLabel("Display name (optional)").fill("Made Here");
    await users.getByLabel("Password", { exact: true }).fill("first-password-123");
    await users.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("admin-revealed-password")).toHaveText("first-password-123");
    expect(await canLogIn(username, "first-password-123")).toBe(true);

    // Find them by display name, reset the password.
    await users.getByLabel("Search users").fill("Made Here");
    const row = users.locator(`[data-user-id^="@${username}:"]`);
    await expect(row).toBeVisible();
    // An in-page form (browser prompts don't exist in the desktop app).
    await row.getByRole("button", { name: "Reset password" }).click();
    await row.getByLabel(/New password/).fill("second-password-456");
    await row.getByLabel("Also sign them out of every device").check();
    await row.getByRole("button", { name: "Set password", exact: true }).click();
    await expect(page.getByTestId("admin-revealed-password")).toHaveText("second-password-456");
    expect(await canLogIn(username, "first-password-123")).toBe(false);
    expect(await canLogIn(username, "second-password-456")).toBe(true);

    // Make admin, then deactivate.
    await row.getByRole("button", { name: "Make admin" }).click();
    await expect(row).toContainText("Admin");
    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row).toContainText("Deactivated");
    expect(await canLogIn(username, "second-password-456")).toBe(false);
});

test("admins send server notices to chosen users", async ({ page, browser }) => {
    const admin = await registerAdmin("admin");
    const bob = await registerUser("bob");
    await signIn(page, admin);
    await openAdmin(page);
    const notices = page.getByTestId("admin-notices");
    await notices.getByLabel("Message").fill("Maintenance tonight at 22:00.");
    await notices.getByRole("radio", { name: "Specific users" }).click();
    await notices.getByLabel(/Users \(names or Matrix IDs/).fill(bob.username);
    page.once("dialog", (dialog) => void dialog.accept());
    await notices.getByRole("button", { name: "Send notice" }).click();
    await expect(page.getByTestId("admin-notice-result")).toContainText("Sent to 1 user.");
    if (process.env.PREVIEW_DIR) await notices.screenshot({ path: `${process.env.PREVIEW_DIR}/admin-notices.png` });

    // Bob gets an invite to the Server notices room under Home → Group Chats, accepts it and reads the notice.
    const bobPage = await (await browser.newContext()).newPage();
    await signIn(bobPage, bob);
    const invite = bobPage.getByTestId("home-invite").filter({ hasText: "Server notices" });
    await expect(invite).toBeVisible({ timeout: 20_000 });
    if (process.env.PREVIEW_DIR) await bobPage.locator(".home-sidebar").screenshot({ path: `${process.env.PREVIEW_DIR}/notice-invite.png` });
    await invite.getByRole("button", { name: "Accept" }).click();
    await expect(bobPage.locator(".timeline").getByText("Maintenance tonight at 22:00.")).toBeVisible({ timeout: 20_000 });
    await expect(bobPage.getByTestId("home-invite")).toHaveCount(0);
});
