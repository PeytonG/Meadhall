// SPDX-License-Identifier: AGPL-3.0-only
// Every voice changer effect, rendered in a real browser: audible, not broken (NaN), and not blown out.
import { expect, test } from "@playwright/test";

import { openHarness } from "./support/harness";

test("every voice effect keeps the voice audible, finite and not clipping hard", async ({ page }) => {
    await openHarness(page, "voiceEffectsHarness.tsx");
    const levels = await page.evaluate(() => (window as unknown as { voiceEffectLevels: Promise<Array<{ id: string; rms: number; peak: number; finite: boolean }>> }).voiceEffectLevels);
    const off = levels.find((level) => level.id === "off")!;
    expect(levels.length).toBeGreaterThanOrEqual(29);
    for (const level of levels) {
        expect(level.finite, `${level.id} produces numbers`).toBe(true);
        // Not much quieter or louder than the plain voice.
        expect(level.rms, `${level.id} is audible`).toBeGreaterThan(off.rms * 0.25);
        expect(level.rms, `${level.id} isn't far louder`).toBeLessThan(off.rms * 4);
        expect(level.peak, `${level.id} doesn't clip hard`).toBeLessThan(2.5);
    }
    console.log(levels.map((level) => `${level.id}: rms ${(level.rms / off.rms).toFixed(2)}x, peak ${level.peak.toFixed(2)}`).join("\n"));
});
