// SPDX-License-Identifier: AGPL-3.0-only
// The soundboard on its own track: it plays even with your mic muted, and listeners turn other people's sounds down
// (for everyone, or per person) without turning their voices down.
import { expect, test, type Page } from "@playwright/test";

import { joinCall, voiceHall } from "./support";

type Stream = { source: string; volume: number; live: boolean; muted: boolean };

async function incoming(page: Page): Promise<Stream[]> {
    return page.evaluate(() =>
        [...document.querySelectorAll<HTMLAudioElement>("audio[data-source]")].map((element) => {
            const track = (element.srcObject as MediaStream | null)?.getAudioTracks()[0];
            return { source: element.dataset.source ?? "", volume: element.volume, live: track?.readyState === "live", muted: track?.muted ?? true };
        }),
    );
}

test("sounds go out on their own track, even muted, and listeners turn them down without the voice", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Bob"]);
    const alice = await joinCall(browser, hall.users[0]!);
    const bob = await joinCall(browser, hall.users[1]!);
    await expect(bob.getByTestId("call-participant")).toHaveCount(2, { timeout: 60_000 });

    // Alice mutes her mic and plays a sound anyway.
    await alice.getByTitle("Mute microphone").click();
    await alice.getByTestId("soundboard-toggle").click();
    await alice.locator(".soundboard-sound").first().click();
    await expect.poll(async () => (await incoming(bob)).some((stream) => stream.source === "soundboard" && stream.live), { timeout: 30_000 }).toBe(true);

    // Bob turns other people's soundboards down to 0 in his call settings: sounds silent, Alice's voice untouched.
    const voiceBefore = (await incoming(bob)).find((stream) => stream.source === "microphone")?.volume;
    await bob.getByTitle("Voice settings").click();
    await bob.getByTestId("call-others-soundboard-volume").fill("0");
    await expect.poll(async () => (await incoming(bob)).find((stream) => stream.source === "soundboard")?.volume).toBe(0);
    expect((await incoming(bob)).find((stream) => stream.source === "microphone")?.volume).toBe(voiceBefore);

    // Back to 100%, then Alice's own "Sounds" slider at 50%.
    await bob.getByTestId("call-others-soundboard-volume").fill("100");
    await bob.getByTestId("participant-sounds-volume").first().fill("50");
    await expect.poll(async () => (await incoming(bob)).find((stream) => stream.source === "soundboard")?.volume).toBeCloseTo(0.5, 2);
    expect((await incoming(bob)).find((stream) => stream.source === "microphone")?.volume).toBe(voiceBefore);
});
