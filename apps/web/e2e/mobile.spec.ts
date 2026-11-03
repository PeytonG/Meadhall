// SPDX-License-Identifier: AGPL-3.0-only
// The phone layout (Android/iOS apps): send button, swipe navigation. Runs as a touch phone.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, joinRoom, readMessages, registerUser, sendMessage, setAccountData } from "./support/matrixApi";
import { signIn } from "./support/ui";

// Runs on the phone projects in playwright.config.ts (Android and iPhone sizes, touch).

// A real touch swipe (touchstart -> moves -> touchend) through the browser's input pipeline.
async function swipe(page: Page, fromX: number, toX: number, y = 420): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    const point = (x: number) => [{ x, y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(fromX) });
    for (let step = 1; step <= 6; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(fromX + ((toX - fromX) * step) / 6) });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
}

async function openDmWithMessage(page: Page): Promise<{ dm: string; aliceId: string; bob: Awaited<ReturnType<typeof registerUser>> }> {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await sendMessage(bob, dm, "hello from bob");
    await signIn(page, alice);
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().tap();
    await expect(page.locator(".timeline").getByText("hello from bob")).toBeVisible();
    return { dm, aliceId: alice.userId, bob };
}

test("phones get a send button next to the emoji button, and it sends", async ({ page }) => {
    const { dm, aliceId, bob } = await openDmWithMessage(page);
    const send = page.getByTestId("composer-send");
    await expect(send).toBeVisible();
    await expect(send).toBeDisabled();

    // Right next to the emoji button.
    const emojiBox = (await page.getByRole("button", { name: "Open emoji picker" }).boundingBox())!;
    const sendBox = (await send.boundingBox())!;
    expect(sendBox.x).toBeGreaterThan(emojiBox.x);
    expect(sendBox.x - (emojiBox.x + emojiBox.width)).toBeLessThan(20);

    await page.getByPlaceholder(/^Message /).fill("sent with the button");
    await expect(send).toBeEnabled();
    await send.tap();
    await expect.poll(async () => (await readMessages(bob, dm)).some((m) => m.sender === aliceId && m.body === "sent with the button"), { timeout: 15_000 }).toBe(true);
    await expect(page.getByPlaceholder(/^Message /)).toHaveValue("");
});

test("swiping right goes back to the list, swiping left returns to the chat", async ({ page }) => {
    await openDmWithMessage(page);
    await swipe(page, 60, 320);
    await expect(page.getByTestId("rail-home")).toBeVisible();
    await expect(page.locator(".timeline").getByText("hello from bob")).toBeHidden();

    await swipe(page, 330, 60);
    await expect(page.locator(".timeline").getByText("hello from bob")).toBeVisible();
    await expect(page.getByTestId("rail-home")).toBeHidden();

    // A vertical scroll isn't a swipe.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 600, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 260, y: 250, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator(".timeline").getByText("hello from bob")).toBeVisible();
});

test("on phones, poll and stickers live in the + menu next to the message box", async ({ page }) => {
    await openDmWithMessage(page);
    // Only emoji and send sit inside the message box.
    await expect(page.getByTestId("composer-poll")).toBeHidden();
    await expect(page.getByRole("button", { name: "Open sticker picker" })).toBeHidden();
    await page.getByTestId("composer-plus").tap();
    const menu = page.getByTestId("composer-plus-menu");
    await expect(menu.getByRole("menuitem")).toHaveText([/Take a photo/, /Upload a file/, /Create a poll/, /Send a sticker/]);
    if (process.env.PREVIEW_DIR) await page.screenshot({ path: `${process.env.PREVIEW_DIR}/phone-${test.info().project.name}-plus-menu.png` });
    await menu.getByRole("menuitem", { name: /Send a sticker/ }).tap();
    await expect(menu).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Stickers" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("composer-plus").tap();
    await page.getByTestId("composer-plus-menu").getByRole("menuitem", { name: /Create a poll/ }).tap();
    await expect(page.getByRole("dialog", { name: /poll/i })).toBeVisible();
});

test("on phones, Take a photo opens the camera and sends the picture", async ({ page }) => {
    await openDmWithMessage(page);
    // The camera input asks the phone for a new picture (capture), not the gallery.
    const camera = page.getByTestId("composer-camera-input");
    await expect(camera).toHaveAttribute("capture", "environment");
    await expect(camera).toHaveAttribute("accept", "image/*");
    await page.getByTestId("composer-plus").tap();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("composer-take-photo").tap();
    // Stand in for the photo the camera app returns: a tall (portrait) picture, like a phone takes.
    const png = Buffer.from(
        await page.evaluate(() => {
            const canvas = document.createElement("canvas");
            canvas.width = 600;
            canvas.height = 900;
            const context = canvas.getContext("2d");
            if (context) {
                context.fillStyle = "#3a7";
                context.fillRect(0, 0, canvas.width, canvas.height);
            }
            return canvas.toDataURL("image/png").split(",")[1];
        }),
        "base64",
    );
    await (await chooser).setFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
    // It waits in the message box, like a picked file; Send sends it.
    await expect(page.getByText("photo.png")).toBeVisible();
    await page.getByRole("button", { name: /^Send/ }).tap();
    const image = page.locator(".timeline img.timeline-image").last();
    await expect(image).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalHeight > 0)).toBe(true);
    // Like Discord, the timeline stays at the bottom once the picture has loaded and grown it.
    await expect
        .poll(() => page.locator(".timeline").evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight))
        .toBeLessThan(4);
});
