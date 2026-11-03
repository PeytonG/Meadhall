// SPDX-License-Identifier: AGPL-3.0-only
// The real Meadhall bot's /timeout: the member can't talk, the bot writes it to the space's moderation log, and when
// the time is up the bot gives them their voice back (the owner reported timeouts that never ended).
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { SYNAPSE_URL, createRoom, createSpaceWithChannel, readEvents, readState, registerUser, sendMessage, sendState, setDisplayName, type ApiUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

const botDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "bot");

function startBot(bot: ApiUser): { process: ChildProcess; output: () => string } {
    let output = "";
    const child = spawn(process.execPath, ["src/main.ts"], {
        cwd: botDir,
        env: { ...process.env, MEADHALL_BOT_HOMESERVER: SYNAPSE_URL, MEADHALL_BOT_USER: bot.username, MEADHALL_BOT_PASSWORD: bot.password },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr!.on("data", (chunk: Buffer) => (output += chunk.toString()));
    return { process: child, output: () => output };
}

const levelOf = async (user: ApiUser, roomId: string, target: string): Promise<number | undefined> =>
    ((await readState(user, roomId, "m.room.power_levels").catch(() => ({}))).users as Record<string, number> | undefined)?.[target];

test("a bot timeout ends on time and is in the moderation log", async ({ page }) => {
    test.setTimeout(300_000);
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const botUser = await registerUser("timeoutbot");
    await setDisplayName(bob, "Bob");
    const { spaceId, channelId } = await createSpaceWithChannel(alice, bob, { space: "Timeout Hall", channel: "general" });
    await sendState(alice, spaceId, "io.github.peytong.meadhall.roles", "", {
        roles: [{ id: "role_bot", name: "Bots", color: "#5865f2", rank: 60, permissions: ["manage_roles", "kick", "ban", "manage_messages"] }],
    });
    // The space's moderation log, with the bot invited (moderators' apps do this when they make it).
    const logRoomId = await createRoom(alice, {
        name: "Timeout Hall moderation log",
        preset: "private_chat",
        invite: [botUser.userId],
        creation_content: { type: "io.github.peytong.meadhall.modlog" },
    });
    await sendState(alice, spaceId, "io.github.peytong.meadhall.moderation_room", "", { room_id: logRoomId });

    const bot = startBot(botUser);
    try {
        await signIn(page, alice);
        await page.getByTitle("Timeout Hall").click();
        await page.getByRole("button", { name: "Space settings", exact: true }).click();
        await page.getByRole("button", { name: "Bots", exact: true }).click();
        const botsTab = page.getByTestId("bots-tab");
        await botsTab.getByLabel("Bot's Matrix ID").fill(botUser.userId);
        await botsTab.getByRole("checkbox", { name: /Bots/ }).check();
        await botsTab.getByRole("button", { name: "Add bot" }).click();
        await expect(botsTab.getByTestId("bot-row")).toContainText("/timeout", { timeout: 60_000 });
        await expect.poll(async () => (await readState(alice, channelId, "m.room.member", botUser.userId).catch(() => ({}))).membership, { timeout: 60_000 }).toBe("join");

        // Adding the bot with a role gives it that role's level (it used to get the role but not the level).
        await expect.poll(() => levelOf(alice, spaceId, botUser.userId), { timeout: 30_000 }).toBe(60);
        await expect.poll(() => levelOf(alice, channelId, botUser.userId), { timeout: 30_000 }).toBe(60);
        await page.waitForTimeout(2_000); // the bot's own copy of the levels
        // One minute (the shortest).
        await sendMessage(alice, channelId, `!timeout ${bob.userId} 1 calm down`);
        await expect.poll(() => levelOf(alice, channelId, bob.userId), { timeout: 30_000 }).toBeLessThan(0);
        await expect
            .poll(async () => (await readEvents(alice, logRoomId)).some((event) => event.type === "io.github.peytong.meadhall.mod_action" && event.content.action === "mute" && event.content.user === bob.userId), { timeout: 30_000 })
            .toBe(true);

        // After the minute (the bot checks every 30 s), Bob can talk again.
        await expect.poll(async () => (await levelOf(alice, channelId, bob.userId)) ?? 0, { timeout: 150_000, intervals: [5_000] }).toBeGreaterThanOrEqual(0);
    } finally {
        bot.process.kill();
        await test.info().attach("bot log", { body: bot.output(), contentType: "text/plain" });
        if (process.env.BOT_LOG) (await import("node:fs")).writeFileSync(process.env.BOT_LOG, bot.output());
    }
});
