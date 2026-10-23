// SPDX-License-Identifier: AGPL-3.0-only
// The in-call soundboard with lots of sounds: it fits in the call view (its top used to be hidden behind the view)
// and scrolls, keeping its title and volume in sight.
import { expect, test } from "@playwright/test";

import { openHarness } from "./support/harness";

for (const { viewport, call } of [
    { viewport: { width: 1440, height: 900 }, call: {} },
    { viewport: { width: 1280, height: 640 }, call: {} },
    { viewport: { width: 900, height: 520 }, call: {} },
    // A DM call under the chat header (the owner's report): the view is short and clipped the panel's top.
    { viewport: { width: 1440, height: 900 }, call: { callTop: "430px", callHeight: "470px" } },
]) {
    const label = `${viewport.width}x${viewport.height}${call.callHeight ? " in a DM call" : ""}`;
    test(`a full soundboard fits and scrolls at ${label}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openHarness(page, "soundboardHarness.tsx", call);
        const panel = page.getByTestId("soundboard");
        await expect(panel.getByRole("button", { name: /Custom sound 20/ })).toBeAttached();

        const layout = await panel.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const area = element.closest(".voice-room-panel")!.getBoundingClientRect();
            return { top: box.top, areaTop: area.top, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
        });
        // Entirely inside the call view; on smaller windows the sounds don't all fit, so it scrolls.
        expect(layout.top).toBeGreaterThanOrEqual(layout.areaTop);
        if (viewport.height < 800 || call.callHeight) expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
        await expect(panel.getByRole("heading", { name: "Soundboard" })).toBeInViewport();
        await expect(panel.getByRole("button", { name: /^.?Duck/ })).toBeInViewport();

        // Scroll with the wheel to the end: the last sound and "Add sound" come into view, the title and volume stay.
        await panel.hover();
        for (let step = 0; step < 20; step += 1) await page.mouse.wheel(0, 400);
        await expect(panel.getByRole("button", { name: /Add sound/ })).toBeInViewport();
        await expect(panel.getByRole("button", { name: /Custom sound 20/ })).toBeInViewport();
        await expect(panel.getByRole("heading", { name: "Soundboard" })).toBeInViewport();
        await expect(panel.getByTestId("soundboard-volume")).toBeInViewport();
        // The title bar covers the scrolled sounds rather than sounds showing through it.
        const headerOnTop = await panel.locator(".soundboard-header").evaluate((header) => {
            const box = header.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width - 10, box.top + 6);
            return header.contains(hit);
        });
        expect(headerOnTop).toBe(true);
        if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/soundboard-${label.replace(/ /g, "-")}.png` });
    });
}
