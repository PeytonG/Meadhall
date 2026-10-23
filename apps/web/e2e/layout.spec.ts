// SPDX-License-Identifier: AGPL-3.0-only
// Discord-style layout: Home (Direct Messages + Group Chats), DM/group call buttons, mute outside calls, and the
// one-screen-at-a-time phone layout used by the Android app.
import { expect, test } from "@playwright/test";

import { seedHall } from "./support/seedHall";
import { signIn } from "./support/ui";

test("Home lists direct messages and group chats, with calls and mute available", async ({ page }) => {
    const { viewer } = await seedHall();
    await signIn(page, viewer);

    const directMessages = page.getByRole("region", { name: "Direct messages" });
    const groupChats = page.getByRole("region", { name: "Group chats" });
    await expect(directMessages.getByText("Hrothgar")).toBeVisible();
    await expect(groupChats.getByText("Shieldwall")).toBeVisible();
    await expect(groupChats.getByText("3 members")).toBeVisible();

    // Group chats have a call button; nobody has to answer, so it's a plain "Start call".
    await groupChats.getByText("Shieldwall").click();
    await expect(page.getByText("Group chat · 3 members")).toBeVisible();
    await expect(page.getByTestId("header-call")).toHaveAttribute("aria-label", "Start call");

    // One-to-one DMs too, and the profile card's Call button is live.
    await directMessages.getByText("Hrothgar").click();
    await expect(page.getByTestId("header-call")).toBeVisible();
    await page.locator(".timeline").getByText("Hrothgar", { exact: true }).first().click();
    await expect(page.getByTestId("profile-call")).toBeEnabled();

    // Mute and deafen work outside calls and are remembered.
    const mute = page.getByTestId("self-mute");
    await mute.click();
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("self-deafen").click();
    await page.getByTestId("self-deafen").click();
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await mute.click();
    await expect(mute).toHaveAttribute("aria-pressed", "false");

    // Server text channels keep Discord's behaviour: no call button.
    await page.getByTitle("The Mead Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    await expect(page.getByText("Then it's settled: Fireside at sundown.")).toBeVisible();
    await expect(page.getByTestId("header-call")).toHaveCount(0);
});

test("phone layout shows one screen at a time", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { viewer } = await seedHall();
    await signIn(page, viewer);

    const back = page.getByRole("button", { name: "Back to channels" });
    await expect(page.getByTestId("rail-home")).toBeVisible();
    await expect(back).toBeHidden();

    await page.getByRole("region", { name: "Group chats" }).getByText("Shieldwall").click();
    await expect(page.locator(".timeline").getByText("Who's bringing the shields tonight?")).toBeVisible();
    await expect(page.getByTestId("rail-home")).toBeHidden();
    // The members panel only opens when asked for, so the chat isn't covered.
    await expect(page.locator(".right-panel")).toHaveCount(0);

    await back.click();
    await expect(page.getByTestId("rail-home")).toBeVisible();
    await expect(page.locator(".timeline").getByText("Who's bringing the shields tonight?")).toBeHidden();
});

test("the phone's Back button returns from a chat to the list", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { viewer } = await seedHall();
    await signIn(page, viewer);

    await page.getByRole("region", { name: "Group chats" }).getByText("Shieldwall").click();
    await expect(page.locator(".timeline").getByText("Who's bringing the shields tonight?")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("rail-home")).toBeVisible();
    await expect(page.locator(".timeline").getByText("Who's bringing the shields tonight?")).toBeHidden();
});
