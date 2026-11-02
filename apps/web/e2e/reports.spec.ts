// SPDX-License-Identifier: AGPL-3.0-only
// Reports and moderation: a member reports a message in a server; the owner (a moderator) gets it in Server
// Settings → Reports, shadow mutes the person (their messages vanish for other members) and bans them for a day;
// the member record shows both; the owner's report reasons are what members pick from.
import { expect, test } from "@playwright/test";

import { createSpaceWithChannel, joinRoom, readState, registerUser, sendMessage, sendState, setDisplayName, type ApiUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

function stateOrEmpty(user: ApiUser, roomId: string, type: string, stateKey = ""): Promise<Record<string, unknown>> {
    return readState(user, roomId, type, stateKey).catch(() => ({}));
}

test("a member reports a message; a moderator shadow mutes and bans from the report", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const owner = await registerUser("owner");
    const reporter = await registerUser("reporter");
    const troll = await registerUser("troll");
    await setDisplayName(owner, "Owner");
    await setDisplayName(reporter, "Reporter");
    await setDisplayName(troll, "Troll");
    const { spaceId, channelId } = await createSpaceWithChannel(owner, reporter, { space: "Report Hall", channel: "general" });
    for (const room of [spaceId, channelId]) {
        await sendState(owner, room, "m.room.join_rules", "", { join_rule: "public" });
        await joinRoom(troll, room);
    }
    await sendState(owner, spaceId, "io.github.peytong.meadhall.report_reasons", "", {
        reasons: [
            { id: "promo", label: "Unauthorized self-promotion" },
            { id: "language", label: "Curse words" },
        ],
    });
    await sendMessage(troll, channelId, "Buy my mixtape at example.com");

    // The reporter reports the message, with the owner's reasons.
    await signIn(page, reporter);
    await page.getByTitle("Report Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    const message = page.locator(".timeline-event").filter({ hasText: "Buy my mixtape" });
    await expect(message).toBeVisible();
    await message.click({ button: "right" });
    await page.getByTestId("message-report").click();
    const dialog = page.getByTestId("report-dialog");
    await expect(dialog.getByText("Curse words")).toBeVisible();
    await dialog.getByText("Unauthorized self-promotion").click();
    await page.getByTestId("report-note").fill("Posts this every hour");
    await page.getByTestId("report-send").click();
    await expect(page.getByText("Reported Troll")).toBeVisible();

    // The owner sees it in Server Settings → Reports (the report room doesn't show in their lists).
    const ownerPage = await browser.newPage();
    await signIn(ownerPage, owner);
    await ownerPage.getByTitle("Report Hall").click();
    await ownerPage.getByRole("button", { name: "Server", exact: true }).click();
    await ownerPage.getByRole("button", { name: "Reports", exact: true }).click();
    const report = ownerPage.getByTestId("mod-report").filter({ hasText: "Troll" });
    await expect(report).toBeVisible({ timeout: 30_000 });
    await expect(report).toContainText("Unauthorized self-promotion");
    await report.locator(".mod-report-summary").click();
    await expect(report.getByText("Buy my mixtape")).toBeVisible();
    await expect(report.getByText("Posts this every hour")).toBeVisible();

    // Shadow mute: the reporter no longer sees the troll's messages.
    await report.getByTestId("mod-shadow").click();
    await expect.poll(async () => (await stateOrEmpty(owner, spaceId, "io.github.peytong.meadhall.sanction", `user:${troll.userId}`)).shadow).toBe(true);
    await sendMessage(troll, channelId, "Still here, buy it");
    await page.reload();
    await page.getByTitle("Report Hall").click().catch(() => undefined);
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    await expect(page.locator(".timeline")).toBeVisible();
    await expect(page.locator(".timeline-event").filter({ hasText: "Still here, buy it" })).toHaveCount(0);

    // Ban for a day from the member record, and the record shows what happened.
    await ownerPage.getByTestId("record-member").selectOption(troll.userId);
    const record = ownerPage.getByTestId("member-record");
    await expect(record.getByText("Shadow muted").first()).toBeVisible({ timeout: 30_000 });
    ownerPage.once("dialog", (dialogEvent) => void dialogEvent.accept());
    await record.getByTestId("mod-timed-ban").click();
    await expect.poll(async () => (await stateOrEmpty(owner, spaceId, "m.room.member", troll.userId)).membership).toBe("ban");
    await expect
        .poll(async () => Number((await stateOrEmpty(owner, spaceId, "io.github.peytong.meadhall.sanction", `user:${troll.userId}`)).ban_until) || 0)
        .toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    await expect(record.getByText("Banned for a time")).toBeVisible({ timeout: 30_000 });
    await ownerPage.close();
});
