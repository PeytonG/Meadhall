// SPDX-License-Identifier: AGPL-3.0-only
// Screen sharing UI in a real browser (component harness, no call server): the picker shows a preview of every
// screen and window before you stream, and the stage scales to the window instead of running off the bottom.
import { expect, test } from "@playwright/test";

import { openHarness } from "./support/harness";

test("the share picker shows a preview for each screen and window, grouped, and selects on click", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHarness(page, "screenShareHarness.tsx", { harnessMode: "picker" });
    const picker = page.getByTestId("screen-share-picker");
    await expect(picker.getByRole("region", { name: "Screens" }).getByTestId("screen-share-source")).toHaveCount(2);
    await expect(picker.getByRole("region", { name: "Windows" }).getByTestId("screen-share-source")).toHaveCount(4);
    const previews = picker.locator(".screen-share-source-preview img");
    await expect(previews).toHaveCount(5);
    for (const preview of await previews.all()) {
        expect(await preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    }
    await expect(picker.getByText("No preview")).toBeVisible();
    const code = picker.getByTestId("screen-share-source").filter({ hasText: "Visual Studio Code" });
    await code.click();
    await expect(code).toHaveAttribute("aria-pressed", "true");
    await expect(picker.getByTestId("screen-share-source").filter({ hasText: "BeamNG.drive" })).toHaveAttribute("aria-pressed", "false");
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/screen-share-picker.png` });
});

test("with lots of windows, Stream this stays in view and previews show as loading", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openHarness(page, "screenShareHarness.tsx", { harnessMode: "many" });
    const dialog = page.getByRole("dialog", { name: "Choose stream source" });
    const stream = dialog.getByRole("button", { name: "Stream this" });
    const inViewport = async (): Promise<boolean> =>
        stream.evaluate((button) => {
            const box = button.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= window.innerHeight && document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button;
        });
    expect(await inViewport()).toBe(true);
    // Scroll the list to the bottom and back: the button never moves out of view.
    const body = dialog.locator(".room-dialog-body");
    expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    expect(await inViewport()).toBe(true);
    await expect(dialog.getByText("Loading preview…").first()).toBeVisible();
    await expect(dialog.getByText("No preview")).toHaveCount(0);
});

for (const { viewport, streams } of [
    { viewport: { width: 1920, height: 1080 }, streams: 2 },
    { viewport: { width: 1440, height: 900 }, streams: 2 },
    { viewport: { width: 1280, height: 640 }, streams: 2 },
    { viewport: { width: 900, height: 560 }, streams: 2 },
    { viewport: { width: 1440, height: 900 }, streams: 4 },
]) {
    test(`${streams} shared screens fit the window at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openHarness(page, "screenShareHarness.tsx", { harnessMode: "stage", streamCount: streams });
        const video = page.getByTestId("stage-video");
        await expect(page.getByTestId("screen-share-tile")).toHaveCount(streams);
        const box = (await video.boundingBox())!;
        // Never taller than the window allows, and doesn't spill sideways; each stream keeps 16:9 (no black bars).
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        for (const tile of await page.getByTestId("screen-share-tile").all()) {
            const tileBox = (await tile.boundingBox())!;
            expect(tileBox.width / tileBox.height).toBeCloseTo(16 / 9, 1);
        }
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        // Header controls stay inside the stage.
        const stage = (await page.getByTestId("stage").boundingBox())!;
        for (const button of await page.locator(".voice-room-stage-header button").all()) {
            const b = (await button.boundingBox())!;
            expect(b.x + b.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
        }
        // Both streams are actually playing.
        for (const tile of await page.locator("[data-testid=screen-share-tile] video").all()) {
            await expect.poll(() => tile.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
        }
        if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/screen-share-${viewport.width}.png` });
    });
}
