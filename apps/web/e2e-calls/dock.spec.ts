// SPDX-License-Identifier: AGPL-3.0-only
// The call controls under "Voice Connected" in the channel list (like Discord's): camera, soundboard and voice
// settings work from there.
import { expect, test } from "@playwright/test";

import { joinCall, voiceHall } from "./support";

test("the voice dock's camera, soundboard and settings buttons control the call", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Bob"]);
    const alice = await joinCall(browser, hall.users[0]!);
    await expect(alice.getByTestId("voice-pill")).toContainText("Voice Connected", { timeout: 60_000 });
    const camera = alice.getByTestId("dock-camera");
    await expect(camera).toBeVisible();

    await camera.click();
    await expect(camera).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
    await expect(alice.getByTestId("camera-toggle")).toHaveAttribute("aria-pressed", "true");
    await camera.click();
    await expect(camera).toHaveAttribute("aria-pressed", "false", { timeout: 30_000 });

    await alice.getByTestId("dock-soundboard").click();
    await expect(alice.getByTestId("soundboard")).toBeVisible();
    await alice.keyboard.press("Escape");
    await alice.getByTestId("dock-voice-settings").click();
    await expect(alice.getByRole("button", { name: "Voice settings" }).first()).toBeVisible();
});
