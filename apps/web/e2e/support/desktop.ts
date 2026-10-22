// SPDX-License-Identifier: AGPL-3.0-only
// Desktop (Electron) checks that run in the browser. The desktop app marks parts of the window as drag regions
// (`-webkit-app-region: drag`); the OS then swallows clicks, drags and wheel scrolling there, so anything
// interactive inside one is dead in the desktop app while working fine in a browser. Playwright's input bypasses
// the OS, so instead of clicking we compute the regions the way Chromium does: every element with an explicit
// app-region adds (drag) or removes (no-drag) its box, in document order, later ones winning.
import type { Page } from "@playwright/test";

// Makes the web app render as the Windows desktop app (title-bar overlay, drag regions).
export async function emulateWindowsDesktopApp(page: Page): Promise<void> {
    await page.addInitScript(() => {
        (window as unknown as { heorotDesktop: unknown }).heorotDesktop = { platform: "win32" };
    });
}

export async function isWindowDragRegionAt(page: Page, x: number, y: number): Promise<boolean> {
    return page.evaluate(
        ({ x, y }) => {
            let draggable = false;
            for (const element of Array.from(document.querySelectorAll("*"))) {
                const style = getComputedStyle(element) as CSSStyleDeclaration & { appRegion?: string };
                const region = style.getPropertyValue("-webkit-app-region") || style.getPropertyValue("app-region") || style.appRegion || "";
                if (region !== "drag" && region !== "no-drag") {
                    continue;
                }
                const box = element.getBoundingClientRect();
                if (box.width === 0 || style.visibility === "hidden" || style.display === "none") {
                    continue;
                }
                if (x >= box.left && x < box.right && y >= box.top && y < box.bottom) {
                    draggable = region === "drag";
                }
            }
            return draggable;
        },
        { x, y },
    );
}

// Points spread over an element's box (corners inset a little, edges and centre).
export async function samplePoints(page: Page, selector: string): Promise<Array<{ x: number; y: number }>> {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) {
        throw new Error(`${selector} is not visible`);
    }
    const xs = [box.x + 3, box.x + box.width / 2, box.x + box.width - 3];
    const ys = [box.y + 3, box.y + box.height / 2, box.y + box.height - 3];
    return xs.flatMap((x) => ys.map((y) => ({ x, y })));
}
