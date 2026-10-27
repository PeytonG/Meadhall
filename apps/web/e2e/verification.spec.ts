// SPDX-License-Identifier: AGPL-3.0-only
// Verification across apps: another app (FluffyChat, Element) set up encryption for the account. Entering that
// recovery key in Meadhall must sign Meadhall's session with the account's cross-signing key, so the other app
// sees it as verified too; restoring message history alone isn't enough. Meadhall must also never replace a
// recovery key it can't use, which would lock the other app's keys away.
import { expect, test, type Page } from "@playwright/test";
import type { MatrixClient } from "matrix-js-sdk";

import { setUpEncryptionLikeAnotherApp, startEncryptingClient } from "./support/cryptoClient";
import { readAccountData, registerUser, SYNAPSE_URL, type ApiUser } from "./support/matrixApi";
import { waitForAppShell } from "./support/ui";

async function fillSignIn(page: Page, user: ApiUser): Promise<void> {
    await page.goto("/");
    await page.getByLabel("Username or email").fill(user.username);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();
}

// Meadhall's session as the other app sees it: signed by the account's cross-signing key?
async function meadhallSessionVerifiedFor(otherApp: MatrixClient, user: ApiUser): Promise<boolean> {
    const crypto = otherApp.getCrypto()!;
    const devices = (await crypto.getUserDeviceInfo([user.userId], true)).get(user.userId) ?? new Map();
    const meadhall = [...devices.keys()].find((deviceId) => deviceId !== otherApp.getDeviceId());
    if (!meadhall) return false;
    return Boolean((await crypto.getDeviceVerificationStatus(user.userId, meadhall))?.crossSigningVerified);
}

async function openEncryptionSettings(page: Page): Promise<void> {
    await page.getByTitle("User settings").click();
    await page.getByRole("button", { name: "Encryption & Recovery", exact: true }).click();
}

test("the recovery key from another app verifies Meadhall's session in both apps", async ({ page }) => {
    const alice = await registerUser("alice");
    const otherApp = await startEncryptingClient(alice);
    try {
        const recoveryKey = await setUpEncryptionLikeAnotherApp(otherApp, alice);

        await fillSignIn(page, alice);
        await expect(page.getByRole("heading", { name: "Recover encrypted history" })).toBeVisible({ timeout: 60_000 });
        await page.getByLabel("Security key", { exact: true }).fill(recoveryKey);
        await page.getByRole("button", { name: "Restore keys" }).click();
        await waitForAppShell(page);

        // The other app now sees Meadhall as verified...
        await expect.poll(() => meadhallSessionVerifiedFor(otherApp, alice), { timeout: 30_000 }).toBe(true);
        // ...and Meadhall says so, and trusts the other app's session.
        await openEncryptionSettings(page);
        await expect(page.getByTestId("session-verified")).toHaveText("Yes", { timeout: 20_000 });
        await page.getByRole("button", { name: "Devices", exact: true }).click();
        await expect(page.getByText(/Verified sessions: 2 \/ 2/)).toBeVisible({ timeout: 20_000 });
    } finally {
        otherApp.stopClient();
    }
});

test("a session that skipped recovery can verify itself later in settings, and can't replace the recovery key first", async ({ page }) => {
    const alice = await registerUser("alice");
    const otherApp = await startEncryptingClient(alice);
    try {
        // Secret storage without a message backup (FluffyChat can leave it like that).
        const recoveryKey = await setUpEncryptionLikeAnotherApp(otherApp, alice, { keyBackup: false });
        const recoveryKeyIdBefore = (await readAccountData(alice, "m.secret_storage.default_key")).key;

        await fillSignIn(page, alice);
        // Asked for the existing key, not offered a new one.
        await expect(page.getByRole("heading", { name: "Recover encrypted history" })).toBeVisible({ timeout: 60_000 });
        await waitForAppShell(page);

        await openEncryptionSettings(page);
        await expect(page.getByTestId("session-verified")).toHaveText("No", { timeout: 20_000 });
        expect(await meadhallSessionVerifiedFor(otherApp, alice)).toBe(false);
        // Changing the recovery key is off until this session is verified.
        await expect(page.getByTestId("recovery-key-locked")).toBeVisible();
        await expect(page.getByRole("button", { name: "Change recovery key" })).toBeDisabled();

        const form = page.getByTestId("verify-with-recovery-key");
        await form.getByLabel("Recovery key").fill(recoveryKey);
        await form.getByRole("button", { name: "Verify this session" }).click();
        await expect(page.getByTestId("session-verified")).toHaveText("Yes", { timeout: 20_000 });
        await expect.poll(() => meadhallSessionVerifiedFor(otherApp, alice), { timeout: 30_000 }).toBe(true);
        // The other app's recovery key is untouched.
        expect((await readAccountData(alice, "m.secret_storage.default_key")).key).toBe(recoveryKeyIdBefore);
        await expect(page.getByRole("button", { name: "Change recovery key" })).toBeEnabled();
    } finally {
        otherApp.stopClient();
    }
});

test("setting up a recovery key on a Meadhall-only account also sets up cross-signing", async ({ page }) => {
    const alice = await registerUser("alice");
    await fillSignIn(page, alice);
    await expect(page.getByRole("heading", { name: "Set up secure backup" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Generate security key" }).click();
    await page.getByRole("button", { name: "Download .txt" }).click();
    await page.getByRole("button", { name: "Finish setup" }).click();
    await waitForAppShell(page);

    // The account now has a cross-signing identity, saved under the new recovery key, and this session is signed.
    const keys = (await (
        await fetch(`${SYNAPSE_URL}/_matrix/client/v3/keys/query`, {
            method: "POST",
            headers: { Authorization: `Bearer ${alice.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ device_keys: { [alice.userId]: [] } }),
        })
    ).json()) as { master_keys?: Record<string, unknown> };
    expect(keys.master_keys?.[alice.userId]).toBeTruthy();
    expect(await readAccountData(alice, "m.cross_signing.master")).toHaveProperty("encrypted");
    await openEncryptionSettings(page);
    await expect(page.getByTestId("session-verified")).toHaveText("Yes", { timeout: 20_000 });
});
