// SPDX-License-Identifier: AGPL-3.0-only
// The phone layout, screen by screen: nothing wider than the screen, touch targets big enough to hit, text big
// enough to read (UI Design Principles: 44pt targets, Android 48dp, 16pt body; Apple: 16pt margins). Saves screenshots with
// PREVIEW_DIR set.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

async function shot(page: Page, name: string): Promise<void> {
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/phone-${test.info().project.name}-${name}.png` });
}

// Visible buttons, links and inputs smaller than 44×44 px, ignoring inline links in text.
async function smallTargets(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const found: string[] = [];
        for (const element of document.querySelectorAll<HTMLElement>("button, [role='button'], a[href], input:not([type='hidden']), select, [role='tab'], [role='option']")) {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (box.width === 0 || box.height === 0 || style.visibility === "hidden" || element.closest("[aria-hidden='true']")) continue;
            if (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue;
            if (element.tagName === "A" && element.closest("p, .timeline-body")) continue;
            // The hit area may be larger than the box (padding via ::before or a wrapping label).
            const label = element.closest("label")?.getBoundingClientRect();
            const width = Math.max(box.width, label?.width ?? 0);
            const height = Math.max(box.height, label?.height ?? 0);
            if (width < 44 || height < 44) found.push(`${element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 30) || element.tagName} ${Math.round(width)}x${Math.round(height)}`);
        }
        return found;
    });
}

async function noSideways(page: Page): Promise<void> {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test("phone screens fit, and their controls are big enough to tap", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(alice, "Alice");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await sendMessage(bob, dm, "Evening! Fire's lit, mead's poured.");
    const { channelId } = await createSpaceWithChannel(bob, alice, { space: "Mead Hall", channel: "general" });
    await sendMessage(bob, channelId, "Welcome to the hall.");

    const report: Record<string, string[]> = {};
    await page.goto("/");
    await shot(page, "1-sign-in");
    report["sign in"] = await smallTargets(page);
    await signIn(page, alice);
    await shot(page, "2-home");
    await noSideways(page);
    report.home = await smallTargets(page);

    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().tap();
    await expect(page.locator(".timeline").getByText("Fire's lit")).toBeVisible();
    await shot(page, "3-dm");
    await noSideways(page);
    report.dm = await smallTargets(page);

    await page.getByRole("button", { name: "Back to channels" }).tap();
    await page.getByTitle("Mead Hall").tap();
    await shot(page, "4-server");
    report.server = await smallTargets(page);
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").tap();
    await expect(page.locator(".timeline").getByText("Welcome to the hall.")).toBeVisible();
    await shot(page, "5-channel");
    await noSideways(page);
    report.channel = await smallTargets(page);

    await page.getByRole("button", { name: "Back to channels" }).tap();
    // Settings live under You (the tab bar is Home, Inbox, You, and Admin for admins).
    await page.getByRole("button", { name: "You: status and accounts" }).tap();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).tap();
    await shot(page, "6-settings");
    await noSideways(page);
    report.settings = await smallTargets(page);

    // Every screen: every control at least 44 × 44.
    expect(report).toEqual({ "sign in": [], home: [], dm: [], server: [], channel: [], settings: [] });
    test.info().annotations.push({ type: "small targets", description: JSON.stringify(report, null, 1) });
    if (process.env.PREVIEW_DIR) {
        const fs = await import("node:fs");
        fs.writeFileSync(`${process.env.PREVIEW_DIR}/phone-${test.info().project.name}-targets.json`, JSON.stringify(report, null, 1));
    }
});
