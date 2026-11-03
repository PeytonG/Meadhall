// SPDX-License-Identifier: AGPL-3.0-only
// The desktop game overlay page (#overlay), like Discord's: the call bar, Voice (talking, per-person volume), Text chat
// (read and send), Notifications and Soundboard widgets; pinning; and the pinned view while you play. The desktop
// bridge is stood in for here; apps/desktop/electron/overlay.ts opens the real window with Shift+`.
import { expect, test } from "@playwright/test";

test("the game overlay shows the call, sends messages and sounds, and pins widgets", async ({ page }) => {
    await page.addInitScript(() => {
        const sent: unknown[] = [];
        const pinned: boolean[] = [];
        const win = window as unknown as Record<string, unknown>;
        win.overlaySent = sent;
        win.overlayPinned = pinned;
        let stateListener: ((state: unknown) => void) | null = null;
        let modeListener: ((mode: string) => void) | null = null;
        win.pushOverlayState = (state: unknown) => stateListener?.(state);
        win.pushOverlayMode = (mode: string) => modeListener?.(mode);
        win.heorotDesktop = {
            platform: "win32",
            getOverlayState: async () => ({
                inCall: true,
                channel: "Gaming",
                micMuted: false,
                deafened: false,
                cameraOn: false,
                sharing: false,
                participants: [
                    { userId: "@a:x", name: "Alice", speaking: true, sharing: false },
                    { userId: "@b:x", name: "Bob", speaking: false, sharing: true, volume: 100 },
                ],
                notifications: [{ id: "$n", sender: "Carol", body: "@alice gg wp", room: "Guild" }],
                chats: [
                    { roomId: "!call", name: "Gaming", messages: [{ id: "$1", sender: "Bob", body: "push mid", room: "Gaming" }] },
                    { roomId: "!dm", name: "Carol", messages: [] },
                ],
                sounds: [{ key: "builtin:horn", name: "Horn", emoji: "📯" }],
            }),
            getOverlayMode: async () => "open",
            onOverlayState: (next: (state: unknown) => void) => {
                stateListener = next;
                return () => undefined;
            },
            onOverlayMode: (next: (mode: string) => void) => {
                modeListener = next;
                return () => undefined;
            },
            overlayCommand: async (command: unknown) => void sent.push(command),
            closeOverlay: async () => void sent.push("close"),
            setOverlayPinned: async (value: boolean) => void pinned.push(value),
        };
    });
    await page.goto("/#overlay");
    const overlay = page.getByTestId("overlay");
    const sent = (): Promise<unknown[]> => page.evaluate(() => (window as unknown as { overlaySent: unknown[] }).overlaySent);
    await expect(overlay).toContainText("Voice Connected");

    // Voice: who's talking, and Bob's volume.
    const voice = page.getByTestId("overlay-widget-voice");
    await expect(voice.locator("li.is-speaking")).toContainText("Alice");
    await voice.getByRole("button", { name: /Bob/ }).click();
    await voice.getByLabel("Volume for Bob").fill("150");
    await expect.poll(sent).toContainEqual({ type: "setVolume", userId: "@b:x", percent: 150 });

    // Text chat: read the call's chat and send to it.
    const chat = page.getByTestId("overlay-widget-chat");
    await expect(chat).toContainText("push mid");
    await chat.getByLabel("Message Gaming").fill("on my way");
    await chat.getByLabel("Message Gaming").press("Enter");
    await expect.poll(sent).toContainEqual({ type: "sendMessage", roomId: "!call", body: "on my way" });

    // Notifications.
    await expect(page.getByTestId("overlay-widget-notifications")).toContainText("@alice gg wp");

    // Soundboard (hidden by default; shown from the overlay settings).
    await overlay.getByRole("button", { name: "Overlay settings" }).click();
    await page.getByTestId("overlay-settings").getByLabel("Show Soundboard").check();
    await page.getByTestId("overlay-widget-soundboard").getByRole("button", { name: /Horn/ }).click();
    await expect.poll(sent).toContainEqual({ type: "playSound", key: "builtin:horn" });

    // Pin the voice widget: the window is told something stays on screen; in pinned mode only it shows.
    await voice.getByRole("button", { name: "Pin Voice" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { overlayPinned: boolean[] }).overlayPinned.at(-1))).toBe(true);
    await page.evaluate(() => (window as unknown as { pushOverlayMode: (mode: string) => void }).pushOverlayMode("pinned"));
    await expect(page.getByTestId("overlay-widget-voice")).toBeVisible();
    await expect(page.getByTestId("overlay-widget-chat")).toHaveCount(0);
    await expect(overlay.getByRole("button", { name: "Mute" })).toHaveCount(0);

    // Back open: Escape closes.
    await page.evaluate(() => (window as unknown as { pushOverlayMode: (mode: string) => void }).pushOverlayMode("open"));
    await page.keyboard.press("Escape");
    await expect.poll(sent).toContain("close");
});
