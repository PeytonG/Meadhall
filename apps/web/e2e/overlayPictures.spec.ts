// SPDX-License-Identifier: AGPL-3.0-only
// The main window sends the game overlay the pictures in its chats: from an unencrypted channel as the homeserver's
// own address (the overlay window shares the app's signed media session), from an encrypted DM decrypted into a small
// JPEG (the overlay can't decrypt). The desktop bridge is stood in for, capturing what would go to the overlay.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, sendEvent, setAccountData, uploadMedia } from "./support/matrixApi";
import { signIn } from "./support/ui";

// A real 2×2 PNG (a valid PNG, so the decrypted preview can be drawn).
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII=",
    "base64",
);

type Captured = { chats: Array<{ roomId: string; messages: Array<{ body: string; image?: { thumb: string; full: string } }> }> };

async function captureOverlay(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const win = window as unknown as Record<string, unknown>;
        win.heorotDesktop = {
            setOverlayState: async (state: unknown) => {
                win.overlayState = state;
            },
        };
    });
}

const overlayImage = (page: Page, roomId: string, body: string) =>
    page.evaluate(
        ({ roomId, body }) => {
            const state = (window as unknown as { overlayState?: Captured }).overlayState;
            return state?.chats.find((chat) => chat.roomId === roomId)?.messages.find((message) => message.body === body)?.image ?? null;
        },
        { roomId, body },
    );

test("the overlay gets the pictures from channels and from encrypted DMs", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const { channelId } = await createSpaceWithChannel(bob, alice, { space: "Raid Hall", channel: "screenshots" });
    const mxc = await uploadMedia(bob, PNG, "image/png", "boss.png");
    await sendEvent(bob, channelId, "m.room.message", { msgtype: "m.image", body: "boss.png", url: mxc, info: { mimetype: "image/png", w: 2, h: 2, size: PNG.length } });
    const dm = await createRoom(bob, {
        is_direct: true,
        preset: "trusted_private_chat",
        invite: [alice.userId],
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });

    await captureOverlay(page);
    await signIn(page, alice);

    // The channel's picture: the homeserver's thumbnail and full image, which the overlay window loads signed.
    await expect.poll(() => overlayImage(page, channelId, "boss.png"), { timeout: 30_000 }).not.toBeNull();
    const plain = (await overlayImage(page, channelId, "boss.png"))!;
    expect(plain.thumb).toMatch(/^http:\/\/localhost:8008\/_matrix\/client\/v1\/media\/thumbnail\//);
    expect(plain.full).toMatch(/^http:\/\/localhost:8008\/_matrix\/client\/v1\/media\/download\//);

    // A picture in the encrypted DM (sent from Meadhall, so it's encrypted): decrypted here into a JPEG.
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().click();
    await page.locator(".composer-file-input").setInputFiles({ name: "secret-map.png", mimeType: "image/png", buffer: Buffer.from(PNG) });
    await page.getByPlaceholder(/^Message /).press("Enter");
    await expect.poll(() => overlayImage(page, dm, "secret-map.png").then((image) => image?.thumb.slice(0, 23) ?? null), { timeout: 30_000 }).toBe(
        "data:image/jpeg;base64,",
    );
});
