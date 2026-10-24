// SPDX-License-Identifier: AGPL-3.0-only
// Profile style: a gradient on your profile card and a nameplate behind your name in member lists, like Discord's.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, readProfileField, registerUser, sendMessage, setDisplayName, setPresence, setProfileField } from "./support/matrixApi";
import { signIn } from "./support/ui";

const STYLE_KEY = "io.github.peytong.meadhall.profile_style";

test("others see your card gradient and nameplate; you pick them in Settings → Profile", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Bob");
    await setProfileField(bob, STYLE_KEY, { card: { preset: "aurora" }, nameplate: { colors: ["#ff0000", "#0000ff"] } });
    const hall = await createSpaceWithChannel(bob, alice, { space: "Style Hall", channel: "general" });
    await sendMessage(bob, hall.channelId, "Look at my card");
    await setPresence(bob, "online");
    await signIn(page, alice);
    await page.getByTitle("Style Hall").click();
    await page.getByText("#general", { exact: true }).first().click();

    const membersButton = page.getByRole("button", { name: "Members panel" });
    if (!/is-active/.test((await membersButton.getAttribute("class")) ?? "")) await membersButton.click();
    const bobRow = page.locator(`.rs-member-row[data-user-id="${bob.userId}"]`);
    await expect(bobRow.getByTestId("nameplate")).toHaveAttribute("style", /linear-gradient\(90deg, rgb\(255, 0, 0\)/, { timeout: 20_000 });
    if (process.env.PREVIEW_DIR) await page.locator(".rs-panel").screenshot({ path: `${process.env.PREVIEW_DIR}/nameplates.png` });

    await bobRow.locator(".rs-member-select").click();
    const card = page.getByTestId("profile-card");
    await expect(card).toHaveClass(/has-card-style/, { timeout: 20_000 });
    await expect(card).toHaveAttribute("style", /rgb\(45, 212, 191\)/);
    if (process.env.PREVIEW_DIR) await card.screenshot({ path: `${process.env.PREVIEW_DIR}/profile-card-style.png` });

    // Alice picks her own.
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    const section = page.getByTestId("profile-style");
    await section.getByRole("radiogroup", { name: "Profile card" }).getByRole("radio", { name: "Ember" }).click();
    await section.getByRole("radiogroup", { name: "Nameplate" }).getByRole("radio", { name: "Ocean" }).click();
    await expect.poll(() => readProfileField(alice, alice.userId, STYLE_KEY).catch(() => null)).toEqual({ card: { preset: "ember" }, nameplate: { preset: "ocean" } });
    if (process.env.PREVIEW_DIR) await section.screenshot({ path: `${process.env.PREVIEW_DIR}/profile-style-settings.png` });
});
