// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Updates (desktop app): installing an earlier release, with a warning for versions before rollback
// existed. The desktop bridge is faked: actually installing needs the packaged app (the IPC that does it validates
// the version, see apps/desktop/electron/updater.ts).
import { expect, test } from "@playwright/test";

import { registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("pick an earlier version to install; versions before 0.3.2 warn that there's no going back", async ({ page }) => {
    const alice = await registerUser("alice");
    await page.addInitScript(() => {
        const installs: string[] = [];
        (window as unknown as { installs: string[] }).installs = installs;
        (window as unknown as { heorotDesktop: unknown }).heorotDesktop = {
            platform: "win32",
            getAppVersion: async () => "0.3.2",
            getUpdateStatus: async () => ({ state: "up-to-date", currentVersion: "0.3.2" }),
            onUpdateStatus: () => () => undefined,
            checkForUpdates: async () => ({ state: "up-to-date", currentVersion: "0.3.2" }),
            installVersion: async (version: string) => {
                installs.push(version);
                return { ok: true };
            },
        };
    });
    await page.route("https://api.github.com/repos/PeytonG/Meadhall/releases?per_page=50", (route) =>
        route.fulfill({
            json: [
                { tag_name: "v0.3.2", published_at: "2026-10-24T00:00:00Z" },
                { tag_name: "v0.3.1", published_at: "2026-10-23T00:00:00Z" },
                { tag_name: "v0.3.0", published_at: "2026-10-23T00:00:00Z" },
                { tag_name: "v0.4.0", draft: true },
            ],
        }),
    );
    await signIn(page, alice);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Updates", exact: true }).click();

    const section = page.getByTestId("earlier-versions");
    const select = section.getByRole("combobox", { name: "Version to install" });
    await expect(select.locator("option")).toHaveText(["Choose a version", /^0\.3\.1/, /^0\.3\.0/]);
    await select.selectOption("0.3.1");
    await expect(section.getByTestId("rollback-warning")).toContainText("can't go to another older version without first updating to the newest one");
    if (process.env.PREVIEW_DIR) await section.screenshot({ path: `${process.env.PREVIEW_DIR}/earlier-versions.png` });

    let question = "";
    page.once("dialog", (dialog) => {
        question = dialog.message();
        void dialog.accept();
    });
    await section.getByRole("button", { name: "Install 0.3.1" }).click();
    expect(question).toContain("you'd have to update to the newest version first");
    await expect.poll(() => page.evaluate(() => (window as unknown as { installs: string[] }).installs)).toEqual(["0.3.1"]);
});
