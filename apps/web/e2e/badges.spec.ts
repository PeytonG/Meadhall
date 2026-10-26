// SPDX-License-Identifier: AGPL-3.0-only
// Badges: only the owner's signed list makes official badges. Badges claimed any other way (a profile field a modified
// app could set) show behind "...", marked as not from Meadhall. (The official coin itself is covered by the smoke and
// unit tests: these test accounts aren't founders, and only the owner can sign a list.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, registerUser, sendMessage, setDisplayName, setProfileField } from "./support/matrixApi";
import { signIn } from "./support/ui";

const published = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../badges/badges.json"), "utf8");

test("badges claimed outside the official list show as unofficial, never as the real badge", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    await setProfileField(bob, "io.github.peytong.meadhall.badges", ["Founder", { label: "Staff" }]);
    const hall = await createSpaceWithChannel(bob, alice, { space: "Badge Hall", channel: "general" });
    await sendMessage(bob, hall.channelId, "I am totally a founder");
    let fetched = false;
    await page.route("https://raw.githubusercontent.com/PeytonG/Meadhall/main/badges/badges.json", (route) => {
        fetched = true;
        return route.fulfill({ status: 200, contentType: "application/json", body: published });
    });
    await signIn(page, alice);
    await page.getByTitle("Badge Hall").click();
    await page.getByText("#general", { exact: true }).first().click();

    const header = page.locator(".timeline").getByText("Bob", { exact: true }).first().locator("xpath=..");
    const unofficial = header.getByTestId("unofficial-badges");
    await expect(unofficial).toBeVisible({ timeout: 20_000 });
    await expect(unofficial).toHaveAttribute("title", "Unofficial badges, not from Meadhall: Founder, Staff");
    await expect(header.locator('[data-badge="founder"]')).toHaveCount(0);
    expect(fetched).toBe(true);
});

test("badges show on profile cards even when the name is too long to fit", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob With An Extremely Long Display Name That Never Fits");
    await setProfileField(bob, "io.github.peytong.meadhall.badges", ["Staff"]);
    const hall = await createSpaceWithChannel(bob, alice, { space: "Card Hall", channel: "general" });
    await sendMessage(bob, hall.channelId, "look at my card");
    await page.route("https://raw.githubusercontent.com/PeytonG/Meadhall/main/badges/badges.json", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: published }),
    );
    await signIn(page, alice);
    await page.getByTitle("Card Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    await page.locator(".timeline .timeline-sender").filter({ hasText: "Bob With" }).first().click();
    const card = page.getByTestId("profile-card");
    const badge = card.locator(".rp-profile-name-row").getByTestId("unofficial-badges");
    await expect(badge).toBeVisible({ timeout: 20_000 });
    const cardBox = (await card.boundingBox())!;
    const badgeBox = (await badge.boundingBox())!;
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
});
