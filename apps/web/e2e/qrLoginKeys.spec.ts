// SPDX-License-Identifier: AGPL-3.0-only
// Sign in with a QR code that also brings your encryption keys (optional): the new device is verified straight away,
// without entering the recovery key.
import { expect, test, type Page } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { waitForAppShell } from "./support/ui";

async function openEncryption(page: Page): Promise<void> {
    await page.getByTitle("User settings").click();
    await page.getByRole("button", { name: "Encryption & Recovery", exact: true }).click();
}

test("a QR code with keys signs in a new device that is already verified", async ({ browser }) => {
    const alice = await registerUser("alice");
    const old = await (await browser.newContext({ acceptDownloads: true })).newPage();
    await old.goto("/");
    await old.getByLabel("Username or email").fill(alice.username);
    await old.getByLabel("Password", { exact: true }).fill(alice.password);
    await old.locator("form").getByRole("button", { name: "Sign in" }).click();
    // A recovery key and cross-signing identity, made on this device (so it holds the keys).
    await expect(old.getByRole("heading", { name: "Set up secure backup" })).toBeVisible({ timeout: 60_000 });
    await old.getByRole("button", { name: "Generate security key" }).click();
    await old.getByRole("button", { name: "Download .txt" }).click();
    await old.getByRole("button", { name: "Finish setup" }).click();
    await waitForAppShell(old);

    await old.getByTitle("User settings").click();
    await old.getByRole("button", { name: "Devices", exact: true }).click();
    await old.getByTestId("qr-login-start").click();
    await old.getByTestId("qr-login-with-keys").check();
    await old.getByTestId("qr-login-password").fill(alice.password);
    await old.getByTestId("qr-login-create").click();
    await expect(old.getByTestId("qr-login-show")).toContainText("and read your encrypted messages");
    await old.getByText("Can't scan? Use the code").click();
    const payload = (await old.getByTestId("qr-login-payload").textContent()) ?? "";
    expect(payload).toContain("&k=");

    const fresh = await (await browser.newContext()).newPage();
    await fresh.goto("/");
    await fresh.getByTestId("login-with-qr").click();
    await fresh.getByTestId("qr-login-paste").fill(payload);
    await fresh.getByTestId("qr-login-paste-submit").click();
    // No recovery prompt needed: straight in, and verified.
    await waitForAppShell(fresh);
    await openEncryption(fresh);
    await expect(fresh.getByTestId("session-verified")).toHaveText("Yes", { timeout: 30_000 });
});
