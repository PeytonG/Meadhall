// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Logs: call history and the errors the app ran into, with hints.
import { expect, test } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("Logs shows past calls and errors with a hint, and can be cleared", async ({ page }) => {
    const alice = await registerUser("alice");
    await page.addInitScript(() => {
        if (sessionStorage.getItem("seeded")) return;
        sessionStorage.setItem("seeded", "1");
        const now = Date.now();
        localStorage.setItem(
            "meadhall.call_log.v1",
            JSON.stringify([
                { at: now - 60_000, event: "Joined" },
                { at: now - 30_000, event: "Left: alone in the call for 5 minutes" },
            ]),
        );
        localStorage.setItem(
            "meadhall.error_log.v1",
            JSON.stringify([{ at: now - 10_000, source: "updates", message: "Command pkexec exited with code 127" }]),
        );
    });
    await signIn(page, alice);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Logs", exact: true }).click();

    const calls = page.getByTestId("logs-calls");
    await expect(calls).toContainText("Left: alone in the call for 5 minutes");
    const errors = page.getByTestId("logs-errors");
    await expect(errors).toContainText("Command pkexec exited with code 127");
    await expect(errors.locator("small")).not.toBeEmpty();
    if (process.env.PREVIEW_DIR) await page.getByTestId("logs-tab").screenshot({ path: `${process.env.PREVIEW_DIR}/logs.png` });

    await errors.getByRole("button", { name: "Clear" }).click();
    await expect(errors).toContainText("No errors.");
});
