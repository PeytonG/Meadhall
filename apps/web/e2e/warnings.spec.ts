// SPDX-License-Identifier: AGPL-3.0-only
// Warnings, like Discord's moderation DMs: the owner warns a member from Space Settings → Reports → Member records;
// the member gets a message saying so (with the reason) and the warning shows in their record. The moderation log
// room is encrypted here, as on homeservers that encrypt every new room.
import { expect, test } from "@playwright/test";

import { createRoom, createSpaceWithChannel, registerUser, sendState } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("a warning reaches the member and lands in their record", async ({ page, browser }) => {
    const owner = await registerUser("owner");
    const member = await registerUser("member");
    const { spaceId } = await createSpaceWithChannel(owner, member, { space: "Warn Hall", channel: "general" });
    const logRoomId = await createRoom(owner, {
        name: "Warn Hall moderation log",
        preset: "private_chat",
        creation_content: { type: "io.github.peytong.meadhall.modlog" },
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await sendState(owner, spaceId, "io.github.peytong.meadhall.moderation_room", "", { room_id: logRoomId });

    await signIn(page, owner);
    await page.getByTitle("Warn Hall").click();
    await page.getByRole("button", { name: "Space settings", exact: true }).click();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await page.getByTestId("record-member").selectOption(member.userId);
    const record = page.getByTestId("member-record");
    await expect(record).toContainText("No moderation actions here yet.", { timeout: 30_000 });
    // Warn has no time setting: timed actions are their own group.
    await expect(record.locator(".mod-timed")).not.toContainText("Warn");
    await record.getByLabel("Reason").fill("Keep it civil");
    await record.getByTestId("mod-warn").click();
    await expect(record.locator(".mod-history")).toContainText("Warned", { timeout: 30_000 });
    await expect(record.locator(".mod-history")).toContainText("Keep it civil");

    // The member is told in a direct message from the moderator.
    const memberPage = await (await browser.newContext()).newPage();
    await signIn(memberPage, member);
    await expect(memberPage.locator(".timeline-event").filter({ hasText: "You received a warning in Warn Hall. Reason: Keep it civil" })).toBeVisible({ timeout: 30_000 });

    // Reopening the record later still shows it (read back from the encrypted log).
    await page.reload();
    await page.getByTitle("Warn Hall").click();
    await page.getByRole("button", { name: "Space settings", exact: true }).click();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await page.getByTestId("record-member").selectOption(member.userId);
    await expect(page.getByTestId("member-record").locator(".mod-history")).toContainText("Keep it civil", { timeout: 30_000 });
});
