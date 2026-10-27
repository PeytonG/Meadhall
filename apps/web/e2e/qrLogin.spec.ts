// SPDX-License-Identifier: AGPL-3.0-only
// Sign in with a QR code: a signed-in device makes a one-time code (after the password), a new device signs in
// with it, and the code can't be used twice.
import { expect, test } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("a signed-in device shows a one-time sign-in code that signs in a new device", async ({ browser }) => {
    const alice = await registerUser("alice");
    const old = await (await browser.newContext()).newPage();
    await signIn(old, alice);
    await old.getByTitle("User settings").click();
    await old.getByRole("button", { name: "Devices", exact: true }).click();
    await old.getByTestId("qr-login-start").click();

    // A wrong password makes no code.
    await old.getByTestId("qr-login-password").fill("not-the-password");
    await old.getByTestId("qr-login-create").click();
    await expect(old.getByTestId("qr-login-show")).toContainText("That password didn't work.");

    await old.getByTestId("qr-login-password").fill(alice.password);
    await old.getByTestId("qr-login-create").click();
    await expect(old.locator(".qr-login-canvas")).toBeVisible();
    await expect(old.getByTestId("qr-login-show")).toContainText("Anyone who scans this can sign in as you");
    if (process.env.PREVIEW_DIR) await old.getByTestId("qr-login-show").screenshot({ path: `${process.env.PREVIEW_DIR}/qr-login.png` });
    await old.getByText("Can't scan? Use the code").click();
    const payload = (await old.getByTestId("qr-login-payload").textContent()) ?? "";
    expect(payload).toMatch(/^meadhall-login:1\?hs=/);

    // The new device.
    const fresh = await (await browser.newContext()).newPage();
    await fresh.goto("/");
    await fresh.getByTestId("login-with-qr").click();
    await expect(fresh.getByTestId("qr-login-scan")).toBeVisible();
    await fresh.getByTestId("qr-login-paste").fill("meadhall-login:1?hs=javascript:alert(1)&t=abcdefghij");
    await fresh.getByTestId("qr-login-paste-submit").click();
    await expect(fresh.getByTestId("qr-login-scan")).toContainText("That isn't a Meadhall sign-in code.");
    await fresh.getByTestId("qr-login-paste").fill(payload);
    await fresh.getByTestId("qr-login-paste-submit").click();
    const skip = fresh.getByRole("button", { name: "Skip for now" });
    const home = fresh.getByTestId("rail-home");
    await expect(home.or(skip).first()).toBeVisible({ timeout: 60_000 });

    // Used once: a third device can't reuse it.
    const third = await (await browser.newContext()).newPage();
    await third.goto("/");
    await third.getByTestId("login-with-qr").click();
    await third.getByTestId("qr-login-paste").fill(payload);
    await third.getByTestId("qr-login-paste-submit").click();
    await expect(third.getByTestId("qr-login-scan")).toContainText("expired or was already used");
});
