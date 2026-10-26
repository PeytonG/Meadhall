// SPDX-License-Identifier: AGPL-3.0-only
// Accessibility: axe-core (the checker behind Lighthouse and most screen-reader audits) on the main screens, and
// reduced motion stopping the campfire, banners and transitions.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { seedHall } from "./support/seedHall";
import { signIn } from "./support/ui";

// Serious problems only; colour contrast is checked separately (the pixel theme's dim text is a design choice
// that's reviewed by hand).
async function violations(page: Page, include?: string): Promise<string[]> {
    let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).disableRules(["color-contrast"]);
    if (include) builder = builder.include(include);
    const result = await builder.analyze();
    return result.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}\n    ${violation.nodes.slice(0, 5).map((node) => node.target.join(" ")).join("\n    ")}`);
}

test("sign-in screen has no serious accessibility problems", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Username or email")).toBeVisible();
    expect(await violations(page)).toEqual([]);
});

test("the app, a channel, a DM and settings have no serious accessibility problems", async ({ page }) => {
    const hall = await seedHall();
    await signIn(page, hall.viewer);
    expect(await violations(page), "home").toEqual([]);

    await page.getByTitle("The Mead Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    await expect(page.locator(".timeline")).toContainText("Welcome to the hall");
    expect(await violations(page), "channel").toEqual([]);

    await page.getByTitle("User settings").click();
    expect(await violations(page, "[role='dialog']"), "settings").toEqual([]);
});

test("reduce motion: campfire, banners and transitions stand still", async ({ page }) => {
    const hall = await seedHall();
    await signIn(page, hall.viewer);
    await page.getByTitle("User settings").click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByTestId("reduce-motion-toggle").check();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "on");
    // Every running animation is now effectively instant.
    const durations = await page.evaluate(() =>
        [...document.querySelectorAll("*")].map((element) => getComputedStyle(element).animationDuration).filter((value) => value !== "0s" && value !== "1e-05s"),
    );
    expect(durations).toEqual([]);
    await page.getByTestId("reduce-motion-toggle").uncheck();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "off");
});

test.describe("with the system asking for reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("it's on without touching Settings", async ({ page }) => {
        const hall = await seedHall();
        await signIn(page, hall.viewer);
        await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "on");
    });
});
