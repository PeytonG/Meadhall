// SPDX-License-Identifier: AGPL-3.0-only
// GIFs play their loop in the chat, in previews and in the viewer.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Locator } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

// Two 64x64 frames, red then blue, 300 ms each, looping forever.
const GIF = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/blink.gif"));

// Screenshots over ~1.5 s: an animated GIF shows more than one distinct frame.
async function distinctFrames(target: Locator): Promise<number> {
    const frames = new Set<string>();
    for (let index = 0; index < 8; index += 1) {
        frames.add((await target.screenshot()).toString("base64"));
        await target.page().waitForTimeout(200);
    }
    return frames.size;
}

test("a GIF sent in a channel keeps looping", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await createSpaceWithChannel(bob, alice, { space: "Gif Hall", channel: "gifs" });
    await signIn(page, alice);
    await page.getByTitle("Gif Hall").click();
    await page.getByText("#gifs", { exact: true }).first().click();
    await page.locator(".composer-file-input").setInputFiles({ name: "blink.gif", mimeType: "image/gif", buffer: GIF });
    await page.getByPlaceholder(/^Message #gifs/).press("Enter");
    const image = page.locator(".timeline-image").last();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
    expect(await distinctFrames(image)).toBeGreaterThan(1);
    await image.click();
    expect(await distinctFrames(page.locator(".timeline-lightbox-image"))).toBeGreaterThan(1);
});

test("a GIF sent in an encrypted chat keeps looping", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const roomId = await createRoom(bob, {
        name: "Secret Gifs",
        invite: [alice.userId],
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await joinRoom(alice, roomId);
    await signIn(page, alice);
    await page.getByTestId("home-row").filter({ hasText: "Secret Gifs" }).click();
    await page.locator(".composer-file-input").setInputFiles({ name: "blink.gif", mimeType: "image/gif", buffer: GIF });
    await page.getByPlaceholder(/^Message/).press("Enter");
    const image = page.locator(".timeline-image").last();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
    expect(await distinctFrames(image)).toBeGreaterThan(1);
});

test("a GIF copied from a web page and pasted still loops (not the still frame the clipboard holds)", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await createSpaceWithChannel(bob, alice, { space: "Paste Hall", channel: "gifs" });
    await page.route("https://gifs.example.test/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/gif", headers: { "Access-Control-Allow-Origin": "*" }, body: GIF }),
    );
    await signIn(page, alice);
    await page.getByTitle("Paste Hall").click();
    await page.getByText("#gifs", { exact: true }).first().click();
    const composer = page.getByPlaceholder(/^Message #gifs/);
    // What Chromium puts on the clipboard for "Copy image" on a GIF: a still PNG, plus HTML naming the original.
    await composer.evaluate(async (textarea) => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        canvas.getContext("2d")!.fillRect(0, 0, 64, 64);
        const png = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
        const data = new DataTransfer();
        data.items.add(new File([png], "image.png", { type: "image/png" }));
        data.setData("text/html", '<img src="https://gifs.example.test/media/party.gif">');
        textarea.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(page.locator(".composer-upload-name").first()).toContainText("party.gif", { timeout: 10_000 });
    await composer.press("Enter");
    const image = page.locator(".timeline-image").last();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
    expect(await distinctFrames(image)).toBeGreaterThan(1);
});
