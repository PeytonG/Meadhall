// SPDX-License-Identifier: AGPL-3.0-only
// Server banners: set in Server settings → Overview, shown (GIFs playing) under the server's name in the channel list.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, readState, registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

const GIF = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/blink.gif"));

test("a server banner shows under the server's name, and GIF banners play", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    // Alice owns the server (she can change its settings); Bob is a member.
    const { spaceId } = await createSpaceWithChannel(alice, bob, { space: "Banner Hall", channel: "general" });
    await signIn(page, alice);
    await page.getByTitle("Banner Hall").first().click();
    await expect(page.getByTestId("space-banner")).toHaveCount(0);

    await page.getByRole("button", { name: "Server", exact: true }).click();
    const settings = page.getByTestId("space-banner-settings");
    await settings.getByTestId("space-banner-input").setInputFiles({ name: "banner.gif", mimeType: "image/gif", buffer: GIF });
    await expect(settings.getByRole("img", { name: "Current banner" })).toBeVisible({ timeout: 20_000 });
    expect(String((await readState(bob, spaceId, "io.github.peytong.meadhall.space_banner")).url)).toMatch(/^mxc:\/\//);
    await page.keyboard.press("Escape");

    const banner = page.getByTestId("space-banner").locator("img");
    await expect.poll(() => banner.evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    // Under the name.
    const nameBox = await page.locator(".pane-top-row").first().boundingBox();
    const bannerBox = await banner.boundingBox();
    expect(bannerBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height - 1);
    const frames = new Set<string>();
    for (let index = 0; index < 8; index += 1) {
        frames.add((await banner.screenshot()).toString("base64"));
        await page.waitForTimeout(200);
    }
    expect(frames.size).toBeGreaterThan(1);
    if (process.env.PREVIEW_DIR) await page.locator(".channels-pane").screenshot({ path: `${process.env.PREVIEW_DIR}/space-banner.png` });
});
