// SPDX-License-Identifier: AGPL-3.0-only
// Server bots end to end, with the real Meadhall bot (apps/bot) running against the test homeserver: an admin adds
// it in Server Settings → Bots and sets up onboarding; a new member is held at the onboarding gate, answers, and
// the bot gives them their roles and welcomes them; slash commands show in the message box and the bot answers;
// auto-mod removes a message with a blocked word.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { SYNAPSE_URL, createSpaceWithChannel, readAccountData, readEvents, readState, registerUser, sendMessage, sendState, setDisplayName, type ApiUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

const botDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "bot");

// State that may not exist yet (polled until it does).
function stateOrEmpty(user: ApiUser, roomId: string, type: string, stateKey = ""): Promise<Record<string, unknown>> {
    return readState(user, roomId, type, stateKey).catch(() => ({}));
}

function startBot(bot: ApiUser): { process: ChildProcess; output: () => string } {
    let output = "";
    const child = spawn(process.execPath, ["src/main.ts"], {
        cwd: botDir,
        env: { ...process.env, MEADHALL_BOT_DEBUG: "1", MEADHALL_BOT_HOMESERVER: SYNAPSE_URL, MEADHALL_BOT_USER: bot.username, MEADHALL_BOT_PASSWORD: bot.password },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr!.on("data", (chunk: Buffer) => (output += chunk.toString()));
    return { process: child, output: () => output };
}

test("a server bot runs onboarding, welcomes, answers slash commands and auto-mods", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const botUser = await registerUser("hallbot");
    await setDisplayName(alice, "Alice");
    await setDisplayName(bob, "Bob");
    await setDisplayName(botUser, "Hall Bot");
    const { spaceId, channelId } = await createSpaceWithChannel(alice, bob, { space: "Bot Hall", channel: "general" });
    await sendState(alice, spaceId, "io.github.peytong.meadhall.roles", "", {
        roles: [
            { id: "role_bot", name: "Bots", color: "#5865f2", rank: 60, permissions: ["manage_roles", "kick", "ban", "manage_messages"] },
            { id: "role_member", name: "Member", color: "#99aab5", rank: 1, permissions: [] },
            { id: "role_rpg", name: "RPG fans", color: "#3ba55c", rank: 2, permissions: [] },
        ],
    });

    const bot = startBot(botUser);
    try {
        // Alice adds the bot with the Bots role.
        await signIn(page, alice);
        await openServerSettings(page, "Bot Hall");
        await page.getByRole("button", { name: "Bots", exact: true }).click();
        const botsTab = page.getByTestId("bots-tab");
        await botsTab.getByLabel("Bot's Matrix ID").fill(botUser.userId);
        await botsTab.getByRole("checkbox", { name: /Bots/ }).check();
        await botsTab.getByRole("button", { name: "Add bot" }).click();
        // The bot joins and registers its commands.
        await expect(botsTab.getByTestId("bot-row")).toContainText("In the space", { timeout: 60_000 });
        await expect(botsTab.getByTestId("bot-row")).toContainText("/warn", { timeout: 60_000 });
        await expect.poll(async () => (await stateOrEmpty(alice, channelId, "m.room.member", botUser.userId)).membership, { timeout: 60_000 }).toBe("join");

        // Onboarding: a rule, a question whose answer gives a role, members must finish it to talk, and a welcome.
        await page.getByRole("button", { name: "Onboarding", exact: true }).click();
        const onboarding = page.getByTestId("onboarding-tab");
        await onboarding.getByTestId("onboarding-enabled").check();
        await onboarding.getByLabel("Rules").fill("Be kind\nNo spam");
        await onboarding.getByTestId("onboarding-add-question").click();
        const question = onboarding.getByTestId("onboarding-question");
        await question.getByLabel("Question", { exact: true }).fill("What do you play?");
        await question.getByLabel("Answer 1", { exact: true }).fill("RPGs");
        await question.getByLabel("Role for answer 1").selectOption("role_rpg");
        await onboarding.getByLabel("Member role").selectOption("role_member");
        await onboarding.getByTestId("onboarding-enforced").check();
        await onboarding.getByRole("checkbox", { name: /Give the role to everyone already here/ }).uncheck();
        await onboarding.getByRole("checkbox", { name: "The bot welcomes new members" }).check();
        await onboarding.getByLabel("Welcome channel").selectOption(channelId);
        await onboarding.getByTestId("onboarding-save").click();
        await expect.poll(async () => (await stateOrEmpty(alice, channelId, "m.room.power_levels")).events_default, { timeout: 30_000 }).toBe(1);
        await page.keyboard.press("Escape");

        // Bob is held at the gate, finishes onboarding, and the bot lets him in.
        const bobPage = await (await browser.newContext()).newPage();
        await signIn(bobPage, bob);
        // Coming into the server opens onboarding by itself.
        await bobPage.getByTitle("Bot Hall").click();
        const dialog = bobPage.getByTestId("onboarding-dialog");
        await expect(dialog).toBeVisible({ timeout: 30_000 });
        await expect(dialog).toContainText("Be kind");
        await expect(bobPage.getByTestId("onboarding-finish")).toBeDisabled();
        await dialog.getByTestId("onboarding-accept").check();
        await dialog.getByRole("button", { name: "RPGs" }).click();
        if (process.env.PREVIEW_DIR) await bobPage.getByRole("dialog").screenshot({ path: `${process.env.PREVIEW_DIR}/onboarding.png` });
        await bobPage.getByTestId("onboarding-finish").click();
        await expect(bobPage.getByTestId("onboarding-gate")).toBeHidden({ timeout: 30_000 });
        await expect
            .poll(async () => ((await stateOrEmpty(alice, spaceId, "io.github.peytong.meadhall.member_roles", `user:${bob.userId}`)).roles as string[] | undefined)?.sort(), { timeout: 60_000 })
            .toEqual(["role_member", "role_rpg"]);
        await expect.poll(async () => ((await stateOrEmpty(alice, channelId, "m.room.power_levels")).users as Record<string, number>)[bob.userId], { timeout: 60_000 }).toBe(2);
        await expect(bobPage.locator(".timeline")).toContainText("Welcome to the hall, Bob!", { timeout: 60_000 });
        await expect(bobPage.locator(".timeline").getByTestId("bot-tag").first()).toBeVisible();

        // Slash commands: the menu lists the bot's commands; /warn gets an answer.
        await openChannel(page, "Bot Hall", "general");
        const box = page.getByPlaceholder(/Message/);
        await box.fill("/wa");
        await expect(page.getByTestId("command-menu")).toContainText("/warn <user> [reason]");
        if (process.env.PREVIEW_DIR) await page.locator(".main-chat-composer").screenshot({ path: `${process.env.PREVIEW_DIR}/slash-commands.png` });
        await page.keyboard.press("Enter");
        await expect(box).toHaveValue("/warn ");
        await expect(page.getByTestId("command-hint")).toContainText("Who to warn");
        await page.keyboard.press("Enter");
        await expect(page.getByText("Usage: /warn <user> [reason]")).toBeVisible();
        await box.fill(`/warn ${bob.userId} be nice`);
        await page.keyboard.press("Enter");
        await expect(page.locator(".timeline")).toContainText("Bob, you've been warned by a moderator: be nice", { timeout: 30_000 });
        const sent = (await readEvents(alice, channelId)).find((event) => event.content.body === `/warn ${bob.userId} be nice`);
        expect(sent?.content["io.github.peytong.meadhall.command"]).toEqual({ bot: botUser.userId, name: "warn", args: { user: bob.userId, reason: "be nice" } });

        // Bob can't moderate.
        await sendMessage(bob, channelId, `!kick ${alice.userId}`);
        await expect(page.locator(".timeline")).toContainText("Only moderators can do that.", { timeout: 30_000 });

        // Auto-mod: blocked word removed, with a warning.
        await openServerSettings(page, "Bot Hall");
        await page.getByRole("button", { name: "Auto-mod", exact: true }).click();
        const automod = page.getByTestId("automod-tab");
        await automod.getByTestId("automod-enabled").check();
        await automod.getByLabel("Blocked words").fill("grog");
        await automod.getByTestId("automod-save").click();
        await expect.poll(async () => (await stateOrEmpty(alice, spaceId, "io.github.peytong.meadhall.automod")).enabled, { timeout: 30_000 }).toBe(true);
        await page.keyboard.press("Escape");
        await sendMessage(bob, channelId, "who wants GROG?");
        await expect(page.locator(".timeline")).toContainText("your message was removed: it had a blocked word", { timeout: 30_000 });
        await expect
            .poll(async () => (await readEvents(alice, channelId)).some((event) => event.type === "m.room.message" && event.content.body === "who wants GROG?"), { timeout: 30_000 })
            .toBe(false);
        // The bot keeps nothing about this in account data (only timeouts go there).
        expect((await readAccountData(botUser, "io.github.peytong.meadhall.bot.timeouts").catch(() => ({}))).entries ?? []).toEqual([]);
    } finally {
        bot.process.kill();
        await test.info().attach("bot log", { body: bot.output(), contentType: "text/plain" });
        if (process.env.BOT_LOG) fs.writeFileSync(process.env.BOT_LOG, bot.output());
    }
});

async function openServerSettings(page: import("@playwright/test").Page, server: string): Promise<void> {
    await page.getByTitle(server).click();
    await page.getByRole("button", { name: "Space settings", exact: true }).click();
}

async function openChannel(page: import("@playwright/test").Page, server: string, channel: string): Promise<void> {
    await page.getByTitle(server).click();
    await page.locator(".room-item").filter({ hasText: channel }).locator(".room-item-select").click();
}
