// SPDX-License-Identifier: AGPL-3.0-only
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { SYNAPSE_URL, createSpaceWithChannel, readMessages, readEvents, registerUser, sendMessage, sendStickerEvent } from "./support/matrixApi";
import { signIn } from "./support/ui";

test("shows the Meadhall sign-in screen", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Meadhall" })).toBeVisible();
    await expect(page).toHaveTitle("Meadhall");
    await expect(page.getByLabel("Homeserver")).toHaveValue(SYNAPSE_URL);
});

test("rejects a wrong password", async ({ page }) => {
    const user = await registerUser("wrongpw");
    await page.goto("/");
    await page.getByLabel("Username or email").fill(user.username);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".login-error")).toBeVisible();
    await expect(page.getByTestId("rail-home")).toHaveCount(0);
});

test("signs in, reads a space channel and sends a message", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const { channelId } = await createSpaceWithChannel(bob, alice, { space: "E2E Hall", channel: "general" });
    await sendMessage(bob, channelId, "Hello from Bob");

    await signIn(page, alice);
    await page.getByTitle("E2E Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    await expect(page.getByText("Hello from Bob")).toBeVisible();

    const composer = page.getByPlaceholder("Message #general");
    await composer.fill("Hi from the Meadhall E2E test");
    await composer.press("Enter");

    await expect
        .poll(async () => (await readMessages(bob, channelId)).some((message) => message.sender === alice.userId && message.body === "Hi from the Meadhall E2E test"), {
            timeout: 30_000,
        })
        .toBe(true);
});

test("sends pixel stickers and shows stickers from others", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const { channelId } = await createSpaceWithChannel(bob, alice, { space: "Sticker Hall", channel: "general" });
    const crown = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/assets/stickers/crown.png"));
    await sendStickerEvent(bob, channelId, crown, "Crown");

    await signIn(page, alice);
    await page.getByTitle("Sticker Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    await expect(page.locator(".timeline-sticker img")).toHaveCount(1);

    await page.getByRole("button", { name: "Open sticker picker" }).click();
    await page.getByRole("button", { name: "Send Cheers sticker" }).click();

    await expect(page.locator(".timeline-sticker img")).toHaveCount(2);
    await expect
        .poll(async () =>
            (await readEvents(bob, channelId)).find((event) => event.type === "m.sticker" && event.sender === alice.userId)?.content,
        )
        .toMatchObject({ body: "Cheers", url: expect.stringMatching(/^mxc:\/\/localhost\//), info: { w: 128, h: 128, mimetype: "image/png" } });
});
