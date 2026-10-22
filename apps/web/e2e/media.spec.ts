// SPDX-License-Identifier: AGPL-3.0-only
// Pictures on servers that enforce authenticated media (Synapse's default, and the Meadhall server): the old
// /_matrix/media/v3 URLs return 404, so every image must be fetched signed. Normally the service worker (web) or
// the desktop request hook signs <img> loads; these tests block service workers to cover the cases where neither
// can (first visit, or the desktop hook holding an expired token), which showed images as broken.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, setAccountData } from "./support/matrixApi";
import { signIn } from "./support/ui";

test.use({ serviceWorkers: "block" });

const picture = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/assets/login-hall.webp"));

async function sendPictureAndExpectItToLoad(page: Page, placeholder: RegExp): Promise<void> {
    await page.locator(".composer-file-input").setInputFiles({ name: "raw.png", mimeType: "image/webp", buffer: picture });
    await page.getByPlaceholder(placeholder).press("Enter");
    const image = page.locator(".timeline-image").last();
    await expect(image).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
}

test("pictures sent to a channel load", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await createSpaceWithChannel(bob, alice, { space: "Media Hall", channel: "random" });
    await signIn(page, alice);
    await page.getByTitle("Media Hall").click();
    await page.getByText("#random", { exact: true }).first().click();
    await sendPictureAndExpectItToLoad(page, /^Message #random/);
});

test("pictures sent to an encrypted DM load", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const dm = await createRoom(bob, {
        is_direct: true,
        preset: "trusted_private_chat",
        invite: [alice.userId],
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await signIn(page, alice);
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().click();
    await sendPictureAndExpectItToLoad(page, /^Message /);
});
