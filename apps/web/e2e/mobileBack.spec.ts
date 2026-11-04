// SPDX-License-Identifier: AGPL-3.0-only
// Android's Back button, like Discord's: close what's open, then leave the chat for the list, then a space for Home,
// then put the app in the background. Runs as the Android app by faking Capacitor and the MeadhallNative plugin (the
// real button was checked on the emulator).
import { expect, test, type Page } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, sendMessage, setAccountData } from "./support/matrixApi";
import { signIn } from "./support/ui";

async function fakeAndroidApp(page: Page): Promise<void> {
    // No update notice over the message box.
    await page.route("https://api.github.com/repos/PeytonG/Meadhall/releases/latest", (route) =>
        route.fulfill({ json: { tag_name: "v0.0.1", html_url: "https://github.com/PeytonG/Meadhall/releases", assets: [] } }),
    );
    await page.addInitScript(() => {
        const state = { back: null as null | (() => void), minimized: 0 };
        (window as unknown as { __android: typeof state }).__android = state;
        (window as unknown as { Capacitor: unknown }).Capacitor = {
            getPlatform: () => "android",
            isNativePlatform: () => true,
            Plugins: {
                MeadhallNative: {
                    // Like the real plugin through window.Capacitor.Plugins: the handle itself, not a promise.
                    addListener: (_event: string, listener: () => void) => {
                        state.back = listener;
                        return { remove: async () => undefined };
                    },
                    minimize: async () => {
                        state.minimized += 1;
                    },
                    saveDownload: async () => ({ folder: "Downloads", name: "x" }),
                },
            },
        };
    });
}

const pressBack = (page: Page): Promise<void> =>
    page.evaluate(() => (window as unknown as { __android: { back: (() => void) | null } }).__android.back?.());
const minimized = (page: Page): Promise<number> =>
    page.evaluate(() => (window as unknown as { __android: { minimized: number } }).__android.minimized);

test("Back closes menus, then leaves the chat, then the space, then backgrounds the app", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await sendMessage(bob, dm, "hello from bob");
    await createSpaceWithChannel(bob, alice, { space: "Back Hall", channel: "general" });
    await fakeAndroidApp(page);
    await signIn(page, alice);
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __android: { back: unknown } }).__android.back))).toBe(true);

    // In a chat with the + menu open: Back closes the menu and stays in the chat.
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().tap();
    await expect(page.locator(".timeline").getByText("hello from bob")).toBeVisible();
    await page.getByTestId("composer-plus").tap();
    await expect(page.getByTestId("composer-take-photo")).toBeVisible();
    await pressBack(page);
    await expect(page.getByTestId("composer-take-photo")).toBeHidden();
    await expect(page.locator(".timeline").getByText("hello from bob")).toBeVisible();

    // Back again: the Direct Messages list.
    await pressBack(page);
    await expect(page.getByRole("region", { name: "Direct messages" })).toBeVisible();
    await expect(page.locator(".timeline")).toBeHidden();

    // In a space's channel list, Back goes Home.
    await page.getByTitle("Back Hall").tap();
    await expect(page.getByText("#general", { exact: true }).first()).toBeVisible();
    await pressBack(page);
    await expect(page.getByTestId("rail-home")).toHaveClass(/is-active/);

    // Nothing left: the app goes to the background (not closed), like Discord.
    expect(await minimized(page)).toBe(0);
    await pressBack(page);
    await expect.poll(() => minimized(page)).toBe(1);
});

test("on a phone, shared notes show the list, then the note; Back closes the note, then the notes", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await sendMessage(bob, dm, "let's plan the feast");
    await fakeAndroidApp(page);
    await signIn(page, alice);
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __android: { back: unknown } }).__android.back))).toBe(true);

    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().tap();
    await page.getByRole("button", { name: "More channel actions" }).tap();
    await page.getByRole("menuitem", { name: "Shared notes" }).tap();
    await page.getByTestId("notes-create").tap();
    await page.getByTestId("notes-new-note").tap();
    await page.getByRole("textbox", { name: "Note title" }).first().fill("Feast");
    await page.getByRole("textbox", { name: "Note title" }).first().press("Enter");
    // One thing at a time on a phone: the note fills the screen, without the list.
    await expect(page.getByTestId("note-text")).toBeVisible();
    await expect(page.getByTestId("notes-tree")).toBeHidden();
    await page.getByTestId("note-text").fill("Mead for twelve");
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/notes-phone.png` });

    await pressBack(page);
    await expect(page.getByTestId("notes-tree")).toBeVisible();
    await expect(page.getByTestId("notes-note").filter({ hasText: "Feast" })).toBeVisible();
    await pressBack(page);
    await expect(page.getByTestId("notes-view")).toBeHidden();
    await expect(page.locator(".timeline").getByText("let's plan the feast")).toBeVisible();
    await pressBack(page);
    await expect(page.getByRole("region", { name: "Direct messages" })).toBeVisible();
});
