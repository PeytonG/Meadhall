// SPDX-License-Identifier: AGPL-3.0-only
// Soundboard: the built-in sounds (synthesized in the browser) and your own uploaded sounds.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { transformWithEsbuild } from "vite";

import { readAccountData, registerUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/voice/soundboard/builtinSounds.ts");

// A mono 16-bit WAV of a 440 Hz tone.
function wav(seconds: number): Buffer {
    const rate = 8000;
    const samples = Math.round(seconds * rate);
    const buffer = Buffer.alloc(44 + samples * 2);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + samples * 2, 4);
    buffer.write("WAVEfmt ", 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(rate, 24);
    buffer.writeUInt32LE(rate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(samples * 2, 40);
    for (let index = 0; index < samples; index += 1) {
        buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / rate) * 12000), 44 + index * 2);
    }
    return buffer;
}

test("every built-in sound renders: audible, not clipping, the right length", async ({ page }) => {
    const { code } = await transformWithEsbuild(fs.readFileSync(source, "utf8"), source, { loader: "ts", format: "esm" });
    await page.setContent("<!doctype html><title>sounds</title>");
    await page.addScriptTag({ content: `${code.replace(/^export /gm, "")}\nwindow.sounds = { BUILTIN_SOUNDS, renderBuiltinSound };` });
    const results = await page.evaluate(async () => {
        const { BUILTIN_SOUNDS, renderBuiltinSound } = (window as unknown as {
            sounds: { BUILTIN_SOUNDS: Array<{ id: string; seconds: number }>; renderBuiltinSound: (id: string) => Promise<AudioBuffer> };
        }).sounds;
        const measured = [];
        for (const sound of BUILTIN_SOUNDS) {
            const data = (await renderBuiltinSound(sound.id)).getChannelData(0);
            let sum = 0;
            let peak = 0;
            let finite = true;
            for (const value of data) {
                if (!Number.isFinite(value)) finite = false;
                sum += value * value;
                peak = Math.max(peak, Math.abs(value));
            }
            measured.push({ id: sound.id, seconds: data.length / 48_000, expected: sound.seconds, rms: Math.sqrt(sum / data.length), peak, finite });
        }
        return measured;
    });
    expect(results.length).toBeGreaterThanOrEqual(12);
    for (const result of results) {
        expect(result.finite, result.id).toBe(true);
        expect(result.rms, `${result.id} is audible`).toBeGreaterThan(0.01);
        expect(result.peak, `${result.id} doesn't clip`).toBeLessThanOrEqual(1);
        expect(result.seconds).toBeCloseTo(result.expected, 2);
    }
});

test("your own sounds are uploaded, saved to your account, previewed and removed", async ({ page }) => {
    const alice = await registerUser("alice");
    // Count sounds actually started, to know the preview played.
    await page.addInitScript(() => {
        const start = AudioBufferSourceNode.prototype.start;
        (window as unknown as { soundsStarted: number }).soundsStarted = 0;
        AudioBufferSourceNode.prototype.start = function patched(this: AudioBufferSourceNode, ...args: Parameters<typeof start>) {
            (window as unknown as { soundsStarted: number }).soundsStarted += 1;
            return start.apply(this, args);
        };
    });
    await signIn(page, alice);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    const board = page.getByTestId("soundboard");
    await expect(board.getByRole("button", { name: /Air horn/ })).toBeVisible();

    // Too long: refused before anything is uploaded.
    await board.getByRole("button", { name: /Add sound/ }).click();
    await board.getByTestId("soundboard-file").setInputFiles({ name: "long.wav", mimeType: "audio/wav", buffer: wav(10) });
    await board.getByRole("button", { name: "Save sound" }).click();
    await expect(board.getByText("Sounds can be up to 8 seconds long.")).toBeVisible();

    await board.getByTestId("soundboard-file").setInputFiles({ name: "horn.wav", mimeType: "audio/wav", buffer: wav(0.5) });
    await board.getByLabel("Sound emoji").fill("🎺");
    await board.getByLabel("Sound name").fill("Horn");
    await board.getByRole("button", { name: "Save sound" }).click();
    const horn = board.getByRole("button", { name: /Horn/ }).first();
    await expect(horn).toBeVisible();
    const saved = await readAccountData(alice, "io.github.peytong.meadhall.soundboard");
    expect(saved.sounds).toEqual([expect.objectContaining({ name: "Horn", emoji: "🎺", mxc: expect.stringMatching(/^mxc:\/\//) })]);

    await horn.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { soundsStarted: number }).soundsStarted)).toBeGreaterThan(0);
    await expect(board.locator(".settings-inline-error")).toHaveCount(0);

    await board.getByRole("button", { name: "Remove Horn" }).click({ force: true });
    await expect(board.getByRole("button", { name: /^🎺/ })).toHaveCount(0);
    await expect.poll(async () => (await readAccountData(alice, "io.github.peytong.meadhall.soundboard")).sounds).toEqual([]);
});
