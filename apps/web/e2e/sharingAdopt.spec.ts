// SPDX-License-Identifier: AGPL-3.0-only
// Adopting shared sounds: once adopted, a card stays "Added" (after Play, after reopening the chat, on other copies
// of the same share), and long sound names stay inside their card, list row and soundboard button.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { openHarness } from "./support/harness";
import { createRoom, joinRoom, readAccountData, registerUser, setAccountData, setDisplayName, uploadMedia } from "./support/matrixApi";
import { signIn, waitForAppShell } from "./support/ui";

const LONG_NAME = "Thunderous ovation from the hall";
const LONG_WORD = "Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaah";

// 0.25 s of a quiet tone, 8 kHz mono 16-bit WAV.
function wav(): Uint8Array {
    const samples = 2000;
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    const text = (offset: number, value: string): void => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples * 2, true);
    for (let index = 0; index < samples; index += 1) view.setInt16(44 + index * 2, Math.round(Math.sin(index / 4) * 3000), true);
    return new Uint8Array(buffer);
}

async function turnOnSharing(page: Page): Promise<void> {
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Privacy & Safety", exact: true }).click();
    await page.getByTestId("sharing-toggle").check();
}

// Nothing in the element is drawn outside it (text cut off with "…" is fine).
async function expectContained(element: Locator): Promise<void> {
    const overflow = await element.evaluate((root) => {
        const box = root.getBoundingClientRect();
        const outside: string[] = [];
        for (const child of root.querySelectorAll("*")) {
            const childBox = child.getBoundingClientRect();
            if (childBox.width === 0) continue;
            if (childBox.right > box.right + 1 || childBox.left < box.left - 1) outside.push(`${child.tagName}.${child.className}`);
        }
        return outside;
    });
    expect(overflow).toEqual([]);
}

test("adopted shares stay adopted, and long sound names stay inside the card and the list", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(alice, "Alice");
    const dm = await createRoom(alice, { is_direct: true, preset: "trusted_private_chat", invite: [bob.userId], name: "Alice and Bob" });
    await joinRoom(bob, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await setAccountData(bob, "m.direct", { [alice.userId]: [dm] });
    const mxc = await uploadMedia(alice, wav(), "audio/wav", "ovation.wav");
    await setAccountData(alice, "io.github.peytong.meadhall.soundboard", {
        sounds: [
            { id: "s1", name: LONG_NAME, emoji: "👏", mxc },
            { id: "s2", name: LONG_WORD, emoji: "😱", mxc },
        ],
    });

    await signIn(page, alice);
    await turnOnSharing(page);
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    for (const name of [LONG_NAME, LONG_WORD]) {
        await page.getByRole("button", { name, exact: true }).hover();
        await page.getByRole("button", { name: `Share ${name}` }).click();
        const share = page.getByRole("dialog", { name: `Share "${name}"` });
        await share.getByRole("checkbox").first().check();
        await share.getByRole("button", { name: "Share", exact: true }).click();
        await expect(share).toBeHidden({ timeout: 20_000 });
    }

    const bobPage = await (await browser.newContext()).newPage();
    await signIn(bobPage, bob);
    await turnOnSharing(bobPage);
    await bobPage.keyboard.press("Escape");
    await bobPage.getByTestId("home-row").first().click();
    const longCard = bobPage.getByTestId("share-card").filter({ hasText: LONG_NAME });
    const wordCard = bobPage.getByTestId("share-card").filter({ hasText: LONG_WORD });
    await expect(longCard).toBeVisible({ timeout: 20_000 });
    await expectContained(longCard);
    await expectContained(wordCard);

    await longCard.getByTestId("share-adopt").click();
    await expect(longCard.getByTestId("share-adopt")).toHaveText("Added to your soundboard", { timeout: 20_000 });
    // Playing it afterwards doesn't turn it back into "Adopt".
    await longCard.getByRole("button", { name: "Play" }).click();
    await expect(longCard.getByTestId("share-adopt")).toHaveText("Added to your soundboard");
    await expect(wordCard.getByTestId("share-adopt")).toHaveText("Adopt");
    if (process.env.PREVIEW_DIR) await bobPage.locator(".timeline").screenshot({ path: `${process.env.PREVIEW_DIR}/share-cards-long.png` });

    // Still adopted after reopening the app.
    await bobPage.reload();
    await waitForAppShell(bobPage);
    await bobPage.getByTestId("home-row").first().click();
    await expect(bobPage.getByTestId("share-card").filter({ hasText: LONG_NAME }).getByTestId("share-adopt")).toHaveText("Added to your soundboard", {
        timeout: 20_000,
    });
    const sounds = (await readAccountData(bob, "io.github.peytong.meadhall.soundboard")).sounds as Array<{ name: string }>;
    expect(sounds.map((sound) => sound.name)).toEqual([LONG_NAME]);

    // Long names in Settings → Audio stay in their row.
    await wordCard.getByTestId("share-adopt").click();
    await expect(wordCard.getByTestId("share-adopt")).toHaveText("Added to your soundboard", { timeout: 20_000 });
    await bobPage.getByRole("button", { name: "User settings", exact: true }).click();
    await bobPage.getByRole("button", { name: "Audio", exact: true }).click();
    for (const name of [LONG_NAME, LONG_WORD]) await expectContained(bobPage.getByRole("button", { name, exact: true }));
    if (process.env.PREVIEW_DIR) await bobPage.screenshot({ path: `${process.env.PREVIEW_DIR}/sounds-settings-long.png` });
});

test("long sound names stay inside their buttons in the in-call soundboard", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHarness(page, "soundboardHarness.tsx", { soundNames: [LONG_NAME, LONG_WORD, "Short"] });
    const panel = page.getByTestId("soundboard");
    for (const name of [LONG_NAME, LONG_WORD]) {
        const button = panel.getByRole("button", { name: new RegExp(name) }).first();
        await expect(button).toBeVisible();
        await expectContained(button);
    }
    // Every sound keeps to its own grid cell: no button covers another or sticks out of the panel (a long name used
    // to widen its column and push "Short" out of the panel).
    const problems = await panel.evaluate((root) => {
        const area = root.getBoundingClientRect();
        const boxes = [...root.querySelectorAll(".soundboard-sound")].map((button) => ({ name: button.textContent ?? "", box: button.getBoundingClientRect() }));
        const found: string[] = [];
        for (const [index, { name, box }] of boxes.entries()) {
            if (box.right > area.right + 1 || box.left < area.left - 1) found.push(`${name} sticks out`);
            for (const other of boxes.slice(index + 1)) {
                const overlaps = box.left < other.box.right - 1 && other.box.left < box.right - 1 && box.top < other.box.bottom - 1 && other.box.top < box.bottom - 1;
                if (overlaps) found.push(`${name} covers ${other.name}`);
            }
        }
        return found;
    });
    expect(problems).toEqual([]);
    if (process.env.PREVIEW_DIR) await panel.screenshot({ path: `${process.env.PREVIEW_DIR}/soundboard-long-names.png` });
});
