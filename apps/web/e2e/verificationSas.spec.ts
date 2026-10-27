// SPDX-License-Identifier: AGPL-3.0-only
// "Verify this device" in settings: Meadhall asks your other sessions, the other app (FluffyChat, Element) accepts,
// you compare emoji, and afterwards both apps show both sessions as verified.
import { expect, test, type Page } from "@playwright/test";
import type { MatrixClient } from "matrix-js-sdk";
import {
    CryptoEvent,
    VerificationPhase,
    VerificationRequestEvent,
    VerifierEvent,
    type VerificationRequest,
} from "matrix-js-sdk/lib/crypto-api/index.js";

import { setUpEncryptionLikeAnotherApp, startEncryptingClient } from "./support/cryptoClient";
import { registerUser, type ApiUser } from "./support/matrixApi";
import { waitForAppShell } from "./support/ui";

async function meadhallSessionVerifiedFor(otherApp: MatrixClient, user: ApiUser): Promise<boolean> {
    const crypto = otherApp.getCrypto()!;
    const devices = (await crypto.getUserDeviceInfo([user.userId], true)).get(user.userId) ?? new Map();
    const meadhall = [...devices.keys()].find((deviceId) => deviceId !== otherApp.getDeviceId());
    if (!meadhall) return false;
    return Boolean((await crypto.getDeviceVerificationStatus(user.userId, meadhall))?.crossSigningVerified);
}

// The other app accepts the request and, once Meadhall starts emoji verification, says the emoji match.
function acceptVerificationLikeAnotherApp(otherApp: MatrixClient): void {
    otherApp.on(CryptoEvent.VerificationRequestReceived as never, ((request: VerificationRequest) => {
        let started = false;
        const onChange = (): void => {
            if (started || request.phase !== VerificationPhase.Started || !request.verifier) return;
            started = true;
            const verifier = request.verifier;
            verifier.on(VerifierEvent.ShowSas, (sas) => void sas.confirm());
            void verifier.verify().catch(() => undefined);
        };
        request.on(VerificationRequestEvent.Change, onChange);
        void request.accept();
    }) as never);
}

async function signInSkippingRecovery(page: Page, user: ApiUser): Promise<void> {
    await page.goto("/");
    await page.getByLabel("Username or email").fill(user.username);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();
    await waitForAppShell(page);
}

test("verifying this device from settings against another app verifies it in both apps", async ({ page }) => {
    const alice = await registerUser("alice");
    const otherApp = await startEncryptingClient(alice);
    try {
        await setUpEncryptionLikeAnotherApp(otherApp, alice);
        acceptVerificationLikeAnotherApp(otherApp);
        await signInSkippingRecovery(page, alice);

        await page.getByTitle("User settings").click();
        await page.getByRole("button", { name: "Encryption & Recovery", exact: true }).click();
        await expect(page.getByTestId("session-verified")).toHaveText("No", { timeout: 20_000 });
        await page.getByRole("button", { name: "Verify this device" }).click();

        const startSas = page.getByTestId("start-sas");
        await expect(startSas).toBeEnabled({ timeout: 30_000 });
        await startSas.click();
        await page.getByRole("button", { name: "Code Matches" }).click({ timeout: 30_000 });
        await expect(page.getByText("Verification completed.")).toBeVisible({ timeout: 30_000 });

        await expect.poll(() => meadhallSessionVerifiedFor(otherApp, alice), { timeout: 30_000 }).toBe(true);
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("session-verified")).toHaveText("Yes", { timeout: 30_000 });
    } finally {
        otherApp.stopClient();
    }
});
