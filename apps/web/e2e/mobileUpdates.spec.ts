// SPDX-License-Identifier: AGPL-3.0-only
// The phone apps can't update themselves: they check GitHub's latest release, show a notice with a download link,
// explain how to install it, and the notice can be switched off. (Run as the iOS/Android app by faking Capacitor.)
import { expect, test } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("a newer release shows an update notice with the APK, directions, and a switch to turn it off", async ({ page }) => {
    const alice = await registerUser("alice");
    await page.addInitScript(() => {
        (window as unknown as { Capacitor: unknown }).Capacitor = { getPlatform: () => "ios", isNativePlatform: () => true };
    });
    await page.route("https://api.github.com/repos/PeytonG/Meadhall/releases/latest", (route) =>
        route.fulfill({
            json: {
                tag_name: "v0.9.0",
                html_url: "https://github.com/PeytonG/Meadhall/releases/tag/v0.9.0",
                assets: [{ name: "Meadhall-0.9.0.ipa", browser_download_url: "https://github.com/PeytonG/Meadhall/releases/download/v0.9.0/Meadhall-0.9.0.ipa" }],
            },
        }),
    );
    await signIn(page, alice);

    const banner = page.getByTestId("mobile-update-banner");
    await expect(banner).toContainText("Meadhall 0.9.0 is available.");
    await expect(banner.getByRole("link", { name: "Get the update" })).toHaveAttribute("href", /Meadhall-0\.9\.0\.ipa$/);
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/mobile-update.png` });

    await banner.getByRole("button", { name: "How to install" }).click();
    const updates = page.getByTestId("mobile-updates");
    await expect(updates).toContainText("Meadhall 0.3.0");
    await expect(updates).toContainText("Meadhall 0.9.0 is available.");
    await expect(page.getByRole("heading", { name: "How to install an update" })).toBeVisible();

    await updates.getByTestId("mobile-update-notice-toggle").uncheck();
    await page.reload();
    const skip = page.getByRole("button", { name: "Skip for now" });
    await expect(page.locator(".app-shell").or(skip).first()).toBeVisible({ timeout: 30_000 });
    if (await skip.isVisible()) await skip.click();
    await expect(page.locator(".app-shell")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("mobile-update-banner")).toHaveCount(0);
});
