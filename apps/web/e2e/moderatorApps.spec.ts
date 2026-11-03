// SPDX-License-Identifier: AGPL-3.0-only
// Auto-mod without a bot is opt-in (Space Settings → Auto-mod → "Let moderators' Meadhall …"): off, a blocked word
// stays; on, the moderator's open Meadhall removes it and warns.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, readEvents, registerUser, sendMessage, sendState } from "./support/matrixApi";
import { signIn } from "./support/ui";

const AUTOMOD = { enabled: true, blocked_words: ["grog"], block_links: false, max_mentions: 0, action: "warn", timeout_minutes: 10, exempt_rank: 50 };

test("moderators' apps enforce auto-mod only when the space turns it on", async ({ page }) => {
    const owner = await registerUser("owner");
    const member = await registerUser("member");
    const { spaceId, channelId } = await createSpaceWithChannel(owner, member, { space: "Grog Hall", channel: "general" });
    await sendState(owner, spaceId, "io.github.peytong.meadhall.automod", "", { ...AUTOMOD, moderator_apps: false });

    await signIn(page, owner);
    await page.getByTitle("Grog Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    const stillThere = async (body: string): Promise<boolean> =>
        (await readEvents(owner, channelId)).some((event) => event.type === "m.room.message" && event.content.body === body);

    // Off (the default): nothing removes it.
    await sendMessage(member, channelId, "grog for everyone");
    await expect(page.locator(".timeline-event").filter({ hasText: "grog for everyone" })).toBeVisible();
    await page.waitForTimeout(5_000);
    expect(await stillThere("grog for everyone")).toBe(true);

    // On: the owner turns it on in Space Settings, and the next one is removed with a warning.
    await page.getByRole("button", { name: "Space settings", exact: true }).click();
    await page.getByRole("button", { name: "Auto-mod", exact: true }).click();
    await page.getByTestId("automod-moderator-apps").check();
    await page.getByTestId("automod-save").click();
    await page.keyboard.press("Escape");
    await sendMessage(member, channelId, "more grog please");
    await expect.poll(() => stillThere("more grog please"), { timeout: 30_000 }).toBe(false);
    await expect(page.locator(".timeline")).toContainText("your message was removed: it had a blocked word", { timeout: 30_000 });
});
