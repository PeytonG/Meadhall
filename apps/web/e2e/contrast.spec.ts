// SPDX-License-Identifier: AGPL-3.0-only
// The high contrast theme, for people who find the dark and light themes hard to see: every piece of text on screen
// must reach WCAG AAA (7:1) against its background.
import { expect, test } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("High contrast makes all visible text at least 7:1, and is remembered", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await sendMessage(bob, dm, "Can you read this?");
    await signIn(page, alice);

    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("button", { name: "High contrast", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
    await page.keyboard.press("Escape");
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: "Bob" }).click();
    await expect(page.locator(".timeline").getByText("Can you read this?")).toBeVisible();
    if (process.env.PREVIEW_DIR) {
        await page.screenshot({ path: `${process.env.PREVIEW_DIR}/high-contrast.png` });
    }

    // Walk every visible text node and compare its color with the first opaque background behind it.
    const failures = await page.evaluate(() => {
        const parse = (value: string): number[] | null => {
            const match = /rgba?\(([^)]+)\)/.exec(value);
            if (!match) return null;
            const parts = match[1].split(",").map((part) => Number.parseFloat(part));
            return parts.length === 4 && parts[3] < 0.5 ? null : parts.slice(0, 3);
        };
        const luminance = (rgb: number[]): number => {
            const [r, g, b] = rgb.map((channel) => {
                const value = channel / 255;
                return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a: number[], b: number[]): number => {
            const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
            return (hi + 0.05) / (lo + 0.05);
        };
        const background = (element: Element | null): number[] => {
            for (let node = element; node; node = node.parentElement) {
                const color = parse(getComputedStyle(node).backgroundColor);
                if (color) return color;
            }
            return [0, 0, 0];
        };
        const problems: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent?.trim();
            const element = node.parentElement;
            if (!text || !element) continue;
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            if (style.visibility === "hidden" || box.width === 0 || box.height === 0 || Number(style.opacity) < 0.5) continue;
            if (element.closest("[aria-hidden='true'], .sr-only, .visually-hidden")) continue;
            const color = parse(style.color);
            if (!color) continue;
            const contrast = ratio(color, background(element));
            if (contrast < 7) problems.push(`${text.slice(0, 30)} (${element.className}): ${contrast.toFixed(2)}`);
        }
        return problems;
    });
    expect(failures).toEqual([]);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
});
