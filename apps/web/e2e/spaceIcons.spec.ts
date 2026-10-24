// SPDX-License-Identifier: AGPL-3.0-only
// Space pictures in the server rail: shown when they load, and the space's initial (never a broken image) when not.
import { expect, test } from "@playwright/test";

import { createRoom, registerUser, uploadMedia } from "./support/matrixApi";
import { signIn } from "./support/ui";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("space pictures that can't load fall back to the space's initial", async ({ page }) => {
    const alice = await registerUser("alice");
    const space = (name: string, url: string): Promise<string> =>
        createRoom(alice, {
            name,
            creation_content: { type: "m.space" },
            initial_state: [{ type: "m.room.avatar", state_key: "", content: { url } }],
        });
    await space("Broken Picture", "mxc://localhost/doesnotexist0000000000");
    await space("Good Picture", await uploadMedia(alice, PNG, "image/png", "icon.png"));
    await signIn(page, alice);

    const broken = page.locator(".rail-icon[title='Broken Picture']");
    await expect(broken).toBeVisible();
    await expect(broken.locator("img")).toHaveCount(0, { timeout: 15_000 });
    await expect(broken).toHaveText("B");

    const good = page.locator(".rail-icon[title='Good Picture'] img");
    await expect(good).toBeVisible();
    await expect.poll(() => good.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});
