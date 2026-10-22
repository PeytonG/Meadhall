// SPDX-License-Identifier: AGPL-3.0-only
// Interaction checks for things that broke for real users: dead areas in the desktop app (window drag regions),
// color pickers, scrolling, menu hit areas, and closing modals and the image viewer. Run before calling UI work done.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { createSpaceWithChannel, registerUser, sendMessage, sendStickerEvent, setDisplayName } from "./support/matrixApi";
import { emulateWindowsDesktopApp, isWindowDragRegionAt, samplePoints } from "./support/desktop";
import { signIn } from "./support/ui";

const picture = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/assets/login-hall.webp"));

async function openSettingsTab(page: Page, tab: string): Promise<void> {
    if (!(await page.locator(".settings-overlay").isVisible())) {
        await page.locator(".pane-user-card").click();
    }
    await page.getByRole("button", { name: tab, exact: true }).click();
}

function colorCard(page: Page, heading: string): Locator {
    return page.locator(".settings-section-card", { has: page.getByRole("heading", { name: heading }) });
}

// Which element a real click at a point would land on.
async function elementAt(page: Page, x: number, y: number): Promise<string> {
    return page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element ? `${element.tagName.toLowerCase()}|${element.textContent?.trim().slice(0, 40) ?? ""}` : "";
    }, { x, y });
}

test.describe("desktop app: no dead areas", () => {
    test.beforeEach(async ({ page }) => {
        await emulateWindowsDesktopApp(page);
    });

    test("settings, color wheels and menus take clicks and scrolling; only title bars drag the window", async ({ page }) => {
        const alice = await registerUser("alice");
        const bob = await registerUser("bob");
        await createSpaceWithChannel(bob, alice, { space: "Hall", channel: "general" });
        await signIn(page, alice);
        await page.getByTitle("Hall").click();
        await page.getByText("#general", { exact: true }).first().click();

        // The header's empty space drags the window (it's the title bar), its buttons don't.
        const header = (await page.locator(".channel-header").boundingBox())!;
        expect(await isWindowDragRegionAt(page, header.x + 30, header.y + header.height / 2)).toBe(true);
        for (const point of await samplePoints(page, 'button[aria-label="More channel actions"]')) {
            expect(await isWindowDragRegionAt(page, point.x, point.y)).toBe(false);
        }

        await page.getByRole("button", { name: "More channel actions" }).click();
        for (const point of await samplePoints(page, ".channel-header-menu-panel")) {
            expect(await isWindowDragRegionAt(page, point.x, point.y), `menu at ${point.x},${point.y}`).toBe(false);
        }
        await page.keyboard.press("Escape");

        for (const point of await samplePoints(page, ".timeline")) {
            expect(await isWindowDragRegionAt(page, point.x, point.y)).toBe(false);
        }

        await openSettingsTab(page, "Appearance");
        for (const selector of [".settings-content", ".pixel-color-wheel", ".pixel-color-presets", ".settings-sidebar"]) {
            for (const point of await samplePoints(page, selector)) {
                expect(await isWindowDragRegionAt(page, point.x, point.y), `${selector} at ${point.x},${point.y}`).toBe(false);
            }
        }
        await openSettingsTab(page, "Audio");
        for (const point of await samplePoints(page, ".settings-content")) {
            expect(await isWindowDragRegionAt(page, point.x, point.y)).toBe(false);
        }
    });
});

test("color wheels respond to clicks, drags, swatches and the keyboard", async ({ page }) => {
    const alice = await registerUser("alice");
    await signIn(page, alice);

    for (const [tab, heading] of [
        ["Appearance", "Theme color"],
        ["Audio", "Speaking campfire"],
    ] as const) {
        await openSettingsTab(page, tab);
        const card = colorCard(page, heading);
        const hex = card.locator(".pixel-color-controls input");
        const wheel = card.locator(".pixel-color-wheel");
        await wheel.scrollIntoViewIfNeeded();
        const box = (await wheel.boundingBox())!;

        // Several quick picks in a row: each one sticks.
        for (const fraction of [0.25, 0.5, 0.75]) {
            const before = await hex.inputValue();
            await page.mouse.click(box.x + box.width * fraction, box.y + box.height * 0.5);
            await expect(hex, `${heading}: click at ${fraction}`).not.toHaveValue(before);
        }

        // Dragging across the wheel keeps picking.
        const beforeDrag = await hex.inputValue();
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
        await page.mouse.down();
        for (let step = 1; step <= 8; step += 1) {
            await page.mouse.move(box.x + box.width * (0.2 + step * 0.07), box.y + box.height * 0.3);
        }
        await page.mouse.up();
        await expect(hex).not.toHaveValue(beforeDrag);

        // A swatch right after a wheel pick wins.
        const teal = card.getByRole("button", { name: "Teal" });
        await teal.click();
        await expect(hex).toHaveValue("#1fb5c9");
        await page.waitForTimeout(900); // past the campfire's save delay: nothing snaps back
        await expect(hex).toHaveValue("#1fb5c9");

        // Keyboard: arrows move the pick.
        await wheel.focus();
        await page.keyboard.press("ArrowLeft");
        await expect(hex).not.toHaveValue("#1fb5c9");
    }
});

test("settings scroll with the mouse wheel anywhere, including over the color wheel and inputs", async ({ page }) => {
    const alice = await registerUser("alice");
    await signIn(page, alice);
    await openSettingsTab(page, "Appearance");
    const content = page.locator(".settings-content");

    for (const target of [".settings-content h2", ".pixel-color-wheel", ".pixel-color-controls input"]) {
        const element = page.locator(target).first();
        await element.scrollIntoViewIfNeeded();
        const box = (await element.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        // Scroll whichever way there is room, with the pointer over the target.
        const before = await content.evaluate((element) => element.scrollTop);
        const down = before < 20;
        await page.mouse.wheel(0, down ? 300 : -300);
        await expect
            .poll(() => content.evaluate((element) => element.scrollTop), { message: `wheel over ${target}` })
            [down ? "toBeGreaterThan" : "toBeLessThan"](before);
    }

    // The page behind doesn't scroll along (scroll chaining contained).
    await content.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.mouse.wheel(0, 800);
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
});

test("every item in the channel '...' menu reacts across its whole row", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await createSpaceWithChannel(bob, alice, { space: "Hall", channel: "general" });
    await signIn(page, alice);
    await page.getByTitle("Hall").click();
    await page.getByText("#general", { exact: true }).first().click();

    await page.getByRole("button", { name: "More channel actions" }).click();
    const items = page.locator(".channel-header-menu-item");
    const count = await items.count();
    expect(count).toBeGreaterThan(3);
    for (let index = 0; index < count; index += 1) {
        const item = items.nth(index);
        const label = (await item.textContent())?.trim() ?? "";
        const box = (await item.boundingBox())!;
        expect(box.height, `${label} is tall enough to hit`).toBeGreaterThanOrEqual(30);
        for (const x of [box.x + 4, box.x + box.width / 2, box.x + box.width - 4]) {
            for (const y of [box.y + 3, box.y + box.height / 2, box.y + box.height - 3]) {
                expect(await elementAt(page, x, y), `${label} at ${Math.round(x - box.x)},${Math.round(y - box.y)}`).toContain(
                    `button|${label}`,
                );
            }
        }
    }

    // Clicking the far right edge of an item works.
    const create = page.getByRole("menuitem", { name: "Create room" });
    const box = (await create.boundingBox())!;
    await page.mouse.click(box.x + box.width - 4, box.y + box.height - 3);
    await expect(page.locator(".room-dialog-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".room-dialog-overlay")).toBeHidden();
});

test("the image viewer closes from the backdrop, the X and Escape; settings close with Escape", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const { channelId } = await createSpaceWithChannel(bob, alice, { space: "Hall", channel: "general" });
    await sendStickerEvent(bob, channelId, picture, "The hall");
    await signIn(page, alice);
    await page.getByTitle("Hall").click();
    await page.getByText("#general", { exact: true }).first().click();

    const openViewer = async (): Promise<Locator> => {
        await page.locator(".timeline-image-button").last().click();
        const viewer = page.getByRole("dialog", { name: "Image preview" });
        await expect(viewer).toBeVisible();
        return viewer;
    };

    let viewer = await openViewer();
    const box = (await viewer.boundingBox())!;
    for (const [x, y] of [
        [box.x + 10, box.y + box.height - 10],
        [box.x + box.width / 2, box.y + box.height - 8],
    ]) {
        await page.mouse.click(x, y);
        await expect(viewer, "backdrop click closes the viewer").toBeHidden();
        viewer = await openViewer();
    }
    await page.getByRole("button", { name: "Close image preview" }).click();
    await expect(viewer).toBeHidden();
    viewer = await openViewer();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();

    await page.locator(".pane-user-card").click();
    await expect(page.locator(".settings-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".settings-overlay")).toBeHidden();
});

test("people search finds others by display name in any word order, and quickly", async ({ page }) => {
    const alice = await registerUser("alice");
    const peyton = await registerUser("peytongna");
    await setDisplayName(peyton, "Peyton Gnadinger");
    await createSpaceWithChannel(peyton, alice, { space: "Hall", channel: "general" });
    await signIn(page, alice);

    await page.getByRole("button", { name: "New direct message" }).click();
    const search = page.getByPlaceholder("Search or enter @alice:example.org");
    for (const term of ["Peyton", "gnadinger", "gnad pey", "peytongna"]) {
        await search.fill(term);
        const started = Date.now();
        await expect(page.getByRole("option", { name: /Peyton Gnadinger/ }), `search "${term}"`).toBeVisible({ timeout: 3_000 });
        expect(Date.now() - started, `"${term}" shows up quickly`).toBeLessThan(1_500);
    }
    await search.fill("nobody-matches-this");
    await expect(page.getByRole("option", { name: /Peyton Gnadinger/ })).toBeHidden();
});

test("emoji are pixel art by default, and the Appearance toggle turns that off", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const { channelId } = await createSpaceWithChannel(bob, alice, { space: "Hall", channel: "general" });
    await sendMessage(bob, channelId, "Cheers 🍺🔥 to the hall 🐉");
    await signIn(page, alice);
    await page.getByTitle("Hall").click();
    await page.getByText("#general", { exact: true }).first().click();

    const emoji = page.locator(".timeline .unicode-emoji").first();
    await expect(emoji).toHaveText("🍺");
    await expect(page.getByText(/Cheers/)).toContainText("Cheers 🍺🔥 to the hall 🐉"); // still real, copyable text
    expect(await emoji.evaluate((element) => getComputedStyle(element).filter)).toContain("meadhall-pixel-emoji");
    if (process.env.PREVIEW_DIR) {
        await page.locator(".timeline-event").last().screenshot({ path: `${process.env.PREVIEW_DIR}/pixel-emoji-message.png` });
    }

    await openSettingsTab(page, "Appearance");
    const toggle = page.getByTestId("pixel-emoji-toggle");
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.keyboard.press("Escape");
    expect(await emoji.evaluate((element) => getComputedStyle(element).filter)).toBe("none");
});
