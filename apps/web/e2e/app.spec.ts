import { expect, test, type Page } from "@playwright/test";

import { SYNAPSE_URL, createSpaceWithChannel, readMessages, registerUser, sendMessage, type ApiUser } from "./support/matrixApi";

async function signIn(page: Page, user: ApiUser): Promise<void> {
    await page.goto("/");
    await page.getByLabel("Username or email").fill(user.username);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();

    // A fresh account may be offered secure backup setup and a session check; skip both.
    const appShell = page.locator(".rail-logo");
    const skip = page.getByRole("button", { name: "Skip for now" });
    await expect(appShell.or(skip).first()).toBeVisible({ timeout: 60_000 });
    for (let attempt = 0; attempt < 3 && !(await appShell.isVisible()); attempt += 1) {
        if (await skip.isVisible()) {
            await skip.click();
        }
        await expect(appShell.or(skip).first()).toBeVisible({ timeout: 30_000 });
    }
    await expect(appShell).toHaveText("M");
}

test("shows the Meadhall sign-in screen", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Meadhall" })).toBeVisible();
    await expect(page).toHaveTitle("Meadhall");
    await expect(page.getByLabel("Homeserver")).toHaveValue(SYNAPSE_URL);
});

test("rejects a wrong password", async ({ page }) => {
    const user = await registerUser("wrongpw");
    await page.goto("/");
    await page.getByLabel("Username or email").fill(user.username);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".login-error")).toBeVisible();
    await expect(page.locator(".rail-logo")).toHaveCount(0);
});

test("signs in, reads a space channel and sends a message", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const { channelId } = await createSpaceWithChannel(bob, alice, { space: "E2E Hall", channel: "general" });
    await sendMessage(bob, channelId, "Hello from Bob");

    await signIn(page, alice);
    await page.getByTitle("E2E Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    await expect(page.getByText("Hello from Bob")).toBeVisible();

    const composer = page.getByPlaceholder("Message #general");
    await composer.fill("Hi from the Meadhall E2E test");
    await composer.press("Enter");

    await expect
        .poll(async () => (await readMessages(bob, channelId)).some((message) => message.sender === alice.userId && message.body === "Hi from the Meadhall E2E test"), {
            timeout: 30_000,
        })
        .toBe(true);
});
