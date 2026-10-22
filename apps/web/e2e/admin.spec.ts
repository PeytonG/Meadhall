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
    await page.locator(".pane-user-card").click();
    await page.getByRole("button", { name: "Server admin", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Server admin" })).toBeVisible();
}

test("people who aren't server admins don't get the admin tab", async ({ page }) => {
    const alice = await registerUser("alice");
    await signIn(page, alice);
    await page.locator(".pane-user-card").click();
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
    // Two dialogs in a row: the new password, then "sign out everywhere?".
    const answers = ["second-password-456", ""];
    const answer = (dialog: import("@playwright/test").Dialog): void => {
        const next = answers.shift();
        void (dialog.type() === "prompt" ? dialog.accept(next) : dialog.accept());
        if (answers.length === 0) page.off("dialog", answer);
    };
    page.on("dialog", answer);
    await row.getByRole("button", { name: "Reset password" }).click();
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
