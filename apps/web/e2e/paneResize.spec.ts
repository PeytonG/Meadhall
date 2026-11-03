// SPDX-License-Identifier: AGPL-3.0-only
// Resizing the side panels, like Discord: at any width, names and message previews in the Direct Messages list shorten
// with "…" instead of spilling out, and the member list / profile panel on the right can be resized the same way.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

// Elements inside `selector` whose content spills past their box (and isn't clipped with an ellipsis or scrolling).
async function spills(page: Page, selector: string): Promise<string[]> {
    return page.evaluate((root) => {
        const container = document.querySelector(root);
        if (!container) return ["no container"];
        const box = container.getBoundingClientRect();
        const found: string[] = [];
        const name = (element: Element): string => `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`;
        // How far right something inside `element` can show before an ancestor clips it.
        const clipRight = (element: Element): number => {
            let right = box.right;
            for (let node = element.parentElement; node && node !== container.parentElement; node = node.parentElement) {
                if (getComputedStyle(node).overflowX !== "visible") right = Math.min(right, node.getBoundingClientRect().right);
            }
            return right;
        };
        for (const element of container.querySelectorAll<HTMLElement>("*")) {
            const rect = element.getBoundingClientRect();
            // Skips hidden things and 1px screen-reader-only labels.
            if (rect.width <= 1 || rect.height <= 1) continue;
            const style = getComputedStyle(element);
            if (style.position === "fixed" || element.closest("[role=menu], [role=dialog], [role=tooltip]")) continue;
            if (rect.right > box.right + 1 && style.position !== "absolute") {
                found.push(`${name(element)} right=${Math.round(rect.right)} > ${Math.round(box.right)}`);
            }
            // Text that runs past where it's clipped must end in "…": text-overflow on the element itself, and not as
            // loose text in a flex or grid box (browsers cut that without an ellipsis).
            for (const child of element.childNodes) {
                if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(child);
                const textRight = range.getBoundingClientRect().right;
                const limit = Math.min(clipRight(child as unknown as Element), style.overflowX !== "visible" ? rect.right : Infinity);
                const ellipsized = style.textOverflow === "ellipsis" && !/flex|grid/.test(style.display);
                if (textRight > limit + 1 && !ellipsized) {
                    found.push(`${name(element)} "${child.textContent.trim().slice(0, 24)}" cut without …`);
                }
            }
        }
        return found.slice(0, 20);
    }, selector);
}

async function dragBy(page: Page, selector: string, dx: number): Promise<void> {
    const handle = page.locator(selector);
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx / 2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
}

test("narrowing the Direct Messages list shortens names and previews to fit", async ({ page }) => {
    const alice = await registerUser("alice");
    const direct: Record<string, string[]> = {};
    for (const name of ["Bartholomew Featherstonehaugh-Worthington", "Wealhtheow of the Helmings"]) {
        const friend = await registerUser("friend");
        await setDisplayName(friend, name);
        const dm = await createRoom(friend, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
        await joinRoom(alice, dm);
        direct[friend.userId] = [dm];
        await sendMessage(friend, dm, "This is a rather long message preview that should never spill out of the list row at all");
    }
    await setAccountData(alice, "m.direct", direct);
    await signIn(page, alice);
    const rows = page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row");
    await expect(rows).toHaveCount(2, { timeout: 30_000 });

    for (const dx of [-400, 400, -150]) {
        await dragBy(page, ".channels-pane-resize-handle", dx);
        if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/dm-list-${dx}.png` });
        expect(await spills(page, ".channels-pane")).toEqual([]);
    }
});

// The chat header next to the panels: the name keeps a few letters and nothing overlaps the buttons.
async function headerFits(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const title = document.querySelector(".channel-header-title")?.getBoundingClientRect();
        const row = document.querySelector(".channel-header-title-row");
        const actions = document.querySelector(".channel-header-actions")?.getBoundingClientRect();
        if (!title || !row || !actions) return ["no header"];
        const problems: string[] = [];
        if (title.width < 30) problems.push(`title only ${Math.round(title.width)}px wide`);
        for (const child of row.children) {
            const rect = child.getBoundingClientRect();
            if (rect.width > 0 && rect.right > actions.left + 1) problems.push(`${child.className} overlaps the buttons`);
        }
        return problems;
    });
}

test("the member list and profile panel resize by dragging their edge, and their contents fit", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Hrothgar Healfdene's Son, King of the Danes");
    await createSpaceWithChannel(bob, alice, { space: "Resize Hall", channel: "a-channel-with-a-rather-long-name" });
    await signIn(page, alice);
    await page.getByTitle("Resize Hall").click();
    await page.getByText("#a-channel-with-a-rather-long-name", { exact: true }).first().click();
    const panel = page.locator(".right-panel");
    await expect(panel.locator(".rs-member-row").first()).toBeVisible({ timeout: 30_000 });
    const startWidth = (await panel.boundingBox())!.width;

    // Wider (dragging the left edge to the left), then as narrow as it goes.
    await dragBy(page, "[data-testid=right-panel-resize]", -150);
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(startWidth + 100);
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/members-wide.png` });
    expect(await spills(page, ".right-panel")).toEqual([]);
    expect(await headerFits(page)).toEqual([]);

    await dragBy(page, "[data-testid=right-panel-resize]", 500);
    await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(220);
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/members-narrow.png` });
    expect(await spills(page, ".right-panel")).toEqual([]);

    // The profile shows in the same panel at its width.
    await panel.locator(".rs-member-row").filter({ hasText: "Hrothgar" }).click();
    await expect(panel.getByText("Hrothgar Healfdene's Son, King of the Danes")).toBeVisible();
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/profile-narrow.png` });
    expect(await spills(page, ".right-panel")).toEqual([]);

    // Remembered after a reload.
    await page.reload();
    await page.getByTitle("Resize Hall").click({ timeout: 30_000 });
    await page.getByText("#a-channel-with-a-rather-long-name", { exact: true }).first().click();
    await expect(page.locator(".right-panel")).toBeVisible({ timeout: 30_000 });
    expect(Math.round((await page.locator(".right-panel").boundingBox())!.width)).toBe(220);

    // Both panels as wide as they go: the chat keeps its room and its header still fits.
    await dragBy(page, "[data-testid=right-panel-resize]", -600);
    await dragBy(page, "[data-testid=channels-pane-resize]", 600);
    const chat = (await page.locator(".main-pane:visible").boundingBox())!;
    expect(chat.width).toBeGreaterThanOrEqual(439);
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/both-wide.png` });
    expect(await headerFits(page)).toEqual([]);
    expect(await spills(page, ".channels-pane")).toEqual([]);
});
