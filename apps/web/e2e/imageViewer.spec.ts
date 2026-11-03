// SPDX-License-Identifier: AGPL-3.0-only
// The picture viewer, like Discord's: click zooms in where you clicked, drag moves the zoomed picture, a click without
// dragging zooms back out, the mouse wheel zooms, two fingers pinch, and Download saves the picture.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { createSpaceWithChannel, registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

// A big photo (3000×2000), so a zoomed-in view is larger than the window and can be moved around.
async function bigPhoto(page: Page): Promise<Buffer> {
    const base64 = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 3000;
        canvas.height = 2000;
        const context = canvas.getContext("2d")!;
        const gradient = context.createLinearGradient(0, 0, 3000, 2000);
        gradient.addColorStop(0, "#c33");
        gradient.addColorStop(1, "#33c");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 3000, 2000);
        return canvas.toDataURL("image/png").split(",")[1]!;
    });
    return Buffer.from(base64, "base64");
}

async function openViewer(page: Page): Promise<Locator> {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await createSpaceWithChannel(bob, alice, { space: "Viewer Hall", channel: "photos" });
    await signIn(page, alice);
    await page.getByTitle("Viewer Hall").click();
    await page.getByText("#photos", { exact: true }).first().click();
    await page.locator(".composer-file-input").setInputFiles({ name: "valley.png", mimeType: "image/png", buffer: await bigPhoto(page) });
    await page.getByPlaceholder(/^Message #photos/).press("Enter");
    const thumbnail = page.locator(".timeline-image").last();
    await expect.poll(() => thumbnail.evaluate((element: HTMLImageElement) => element.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
    await thumbnail.click();
    const image = page.locator(".timeline-lightbox-image");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    return image;
}

const scaleOf = (image: Locator): Promise<number> => image.evaluate((element) => Number(element.getAttribute("data-scale")));

test("zoom in where you click, drag to move the picture, click to zoom out", async ({ page }) => {
    const image = await openViewer(page);
    const before = (await image.boundingBox())!;

    // Click a spot left of and above the center: that spot stays under the mouse while the picture doubles.
    const spot = { x: before.x + before.width * 0.25, y: before.y + before.height * 0.3 };
    await page.mouse.click(spot.x, spot.y);
    await expect.poll(() => scaleOf(image)).toBe(2);
    await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(before.width * 2, 0);
    const zoomed = (await image.boundingBox())!;
    expect((spot.x - zoomed.x) / zoomed.width).toBeCloseTo(0.25, 1);

    // Drag left and up: the picture follows the mouse.
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x - 60, spot.y - 40, { steps: 6 });
    await page.mouse.move(spot.x - 120, spot.y - 80, { steps: 6 });
    await page.mouse.up();
    const moved = (await image.boundingBox())!;
    expect(moved.x).toBeCloseTo(zoomed.x - 120, -1);
    expect(moved.y).toBeCloseTo(zoomed.y - 80, -1);
    // Dragging isn't a click: still zoomed in.
    expect(await scaleOf(image)).toBe(2);

    // The picture can't be dragged off screen: its edge stops at the window's edge.
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x + 3000, spot.y, { steps: 10 });
    await page.mouse.up();
    expect((await image.boundingBox())!.x).toBeCloseTo(0, 0);

    // A click without dragging zooms back out; the viewer stays open.
    await page.mouse.click(spot.x, spot.y);
    await expect.poll(() => scaleOf(image)).toBe(1);
    await expect(page.getByRole("dialog", { name: "Image preview" })).toBeVisible();
});

test("the mouse wheel zooms and Download saves the picture", async ({ page }) => {
    const image = await openViewer(page);
    const box = (await image.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await expect.poll(() => scaleOf(image)).toBeGreaterThan(1.5);
    await page.mouse.wheel(0, 2000);
    await expect.poll(() => scaleOf(image)).toBe(1);

    const download = page.waitForEvent("download");
    await page.getByTestId("lightbox-download").click();
    expect((await download).suggestedFilename()).toBe("valley.png");
    await expect(page.getByRole("dialog", { name: "Image preview" })).toBeVisible();
});

test("two fingers pinch to zoom", async ({ page }) => {
    const image = await openViewer(page);
    const box = (await image.boundingBox())!;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // Two touch pointers moving apart (Playwright has no multi-touch, so send the pointer events a phone would).
    await image.evaluate((element, { x, y }) => {
        const send = (type: string, pointerId: number, clientX: number): void => {
            element.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: "touch", clientX, clientY: y, bubbles: true, isPrimary: pointerId === 1 }));
        };
        send("pointerdown", 1, x - 40);
        send("pointerdown", 2, x + 40);
        for (let step = 1; step <= 10; step += 1) {
            send("pointermove", 1, x - 40 - step * 8);
            send("pointermove", 2, x + 40 + step * 8);
        }
        send("pointerup", 1, x - 120);
        send("pointerup", 2, x + 120);
    }, center);
    // The fingers went from 80 px apart to 240 px: three times as big.
    await expect.poll(() => scaleOf(image)).toBeCloseTo(3, 1);
    await expect(page.getByRole("dialog", { name: "Image preview" })).toBeVisible();
});
