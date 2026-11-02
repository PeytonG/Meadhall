// SPDX-License-Identifier: AGPL-3.0-only
// The desktop game overlay page (#overlay): shows the call it's given and sends its button presses back. The desktop
// bridge is stood in for here; apps/desktop/electron/overlay.ts opens the real window with Shift+`.
import { expect, test } from "@playwright/test";

test("the game overlay shows the call and sends its buttons back", async ({ page }) => {
    await page.addInitScript(() => {
        const sent: string[] = [];
        (window as unknown as { overlaySent: string[] }).overlaySent = sent;
        let listener: ((state: unknown) => void) | null = null;
        (window as unknown as { pushOverlayState: (state: unknown) => void }).pushOverlayState = (state) => listener?.(state);
        (window as unknown as { heorotDesktop: Record<string, unknown> }).heorotDesktop = {
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
                    { userId: "@b:x", name: "Bob", speaking: false, sharing: true },
                ],
                messages: [{ id: "$1", sender: "Bob", body: "gg", room: "Gaming" }],
            }),
            onOverlayState: (next: (state: unknown) => void) => {
                listener = next;
                return () => undefined;
            },
            overlayCommand: async (command: string) => void sent.push(command),
            closeOverlay: async () => void sent.push("close"),
        };
    });
    await page.goto("/#overlay");
    const overlay = page.getByTestId("overlay");
    await expect(overlay).toContainText("Voice Connected");
    await expect(overlay).toContainText("Gaming");
    await expect(overlay.locator(".overlay-members li.is-speaking")).toContainText("Alice");
    await expect(overlay.locator(".overlay-members")).toContainText("LIVE");
    await expect(overlay.locator(".overlay-messages")).toContainText("gg");

    await overlay.getByRole("button", { name: "Mute" }).click();
    await overlay.getByRole("button", { name: "Leave call" }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => (window as unknown as { overlaySent: string[] }).overlaySent)).toEqual(["toggleMute", "leave", "close"]);

    // New state from the main window shows right away.
    await page.evaluate(() => (window as unknown as { pushOverlayState: (state: unknown) => void }).pushOverlayState({ inCall: false }));
    await expect(overlay).toContainText("Not in a call");
});
