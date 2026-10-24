// SPDX-License-Identifier: AGPL-3.0-only
// Sharing (off by default): share a soundboard sound or a style profile with friends in a chat; they see what it adds
// and adopt it with one click, without handling any files.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, joinRoom, readAccountData, registerUser, setAccountData, setDisplayName, uploadMedia } from "./support/matrixApi";
import { signIn } from "./support/ui";

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

test("share a sound and a style profile in a DM; the friend adopts them with one click", async ({ page, browser }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(alice, "Alice");
    const dm = await createRoom(alice, { is_direct: true, preset: "trusted_private_chat", invite: [bob.userId], name: "Alice and Bob" });
    await joinRoom(bob, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await setAccountData(bob, "m.direct", { [alice.userId]: [dm] });
    const mxc = await uploadMedia(alice, wav(), "audio/wav", "airhorn.wav");
    await setAccountData(alice, "io.github.peytong.meadhall.soundboard", { sounds: [{ id: "s1", name: "Airhorn", emoji: "📯", mxc }] });

    // Alice: sharing on, share her sound from Settings → Audio.
    await signIn(page, alice);
    await turnOnSharing(page);
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    await page.getByRole("button", { name: "Airhorn", exact: true }).hover();
    await page.getByRole("button", { name: "Share Airhorn" }).click();
    const share = page.getByRole("dialog", { name: 'Share "Airhorn"' });
    await share.getByRole("checkbox").first().check();
    await share.getByRole("button", { name: "Share", exact: true }).click();
    await expect(share).toBeHidden({ timeout: 20_000 });

    // And a style profile from Settings → Appearance.
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    const profiles = page.getByTestId("style-profiles");
    await profiles.getByLabel("Style profile name").fill("Midnight");
    await profiles.getByRole("button", { name: "Save current look" }).click();
    await expect(profiles.getByTestId("style-profile")).toHaveCount(1);
    await profiles.getByRole("button", { name: "Share" }).click();
    const shareStyle = page.getByRole("dialog", { name: 'Share "Midnight"' });
    await shareStyle.getByRole("checkbox").first().check();
    await shareStyle.getByRole("button", { name: "Share", exact: true }).click();
    await expect(shareStyle).toBeHidden({ timeout: 20_000 });

    // Bob: sharing is off at first, so the cards say how to turn it on.
    const bobPage = await (await browser.newContext()).newPage();
    await signIn(bobPage, bob);
    await bobPage.getByTestId("home-row").first().click();
    const soundCard = bobPage.getByTestId("share-card").filter({ hasText: "Airhorn" });
    await expect(soundCard).toContainText("Soundboard sound", { timeout: 20_000 });
    await expect(soundCard).toContainText("Turn on Sharing");
    await turnOnSharing(bobPage);
    await bobPage.keyboard.press("Escape");
    if (process.env.PREVIEW_DIR) await bobPage.locator(".timeline").screenshot({ path: `${process.env.PREVIEW_DIR}/sharing-cards.png` });

    await soundCard.getByTestId("share-adopt").click();
    await expect(soundCard.getByTestId("share-adopt")).toHaveText("Added to your soundboard", { timeout: 20_000 });
    const bobSounds = (await readAccountData(bob, "io.github.peytong.meadhall.soundboard")).sounds as Array<{ name: string; emoji: string; mxc: string }>;
    expect(bobSounds.map((sound) => [sound.name, sound.emoji])).toEqual([["Airhorn", "📯"]]);
    // Re-uploaded to Bob's own server, not pointing at Alice's copy.
    expect(bobSounds[0]!.mxc).not.toBe(mxc);

    const styleCard = bobPage.getByTestId("share-card").filter({ hasText: "Midnight" });
    await expect(styleCard).toContainText("Style profile");
    await styleCard.getByTestId("share-adopt").click();
    await expect(styleCard.getByTestId("share-adopt")).toHaveText("Saved to your style profiles", { timeout: 20_000 });
    const bobProfiles = (await readAccountData(bob, "io.github.peytong.meadhall.style_profiles")).profiles as Array<{ name: string }>;
    expect(bobProfiles.map((profile) => profile.name)).toEqual(["Midnight"]);
});

test("import a .meadhall style file and switch to it", async ({ page }) => {
    const alice = await registerUser("alice");
    await signIn(page, alice);
    await turnOnSharing(page);
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    const profiles = page.getByTestId("style-profiles");
    const file = JSON.stringify({ format: "meadhall", version: 1, kind: "style", name: "Daylight", appearance: { theme: "light", accentColor: "#22aa55", iconStyle: "smooth" } });
    await profiles.getByTestId("style-import").setInputFiles({ name: "Daylight.meadhall", mimeType: "application/x-meadhall", buffer: Buffer.from(file) });
    await expect(profiles.getByTestId("style-profile")).toContainText("Daylight", { timeout: 20_000 });
    await profiles.getByTestId("style-profile").filter({ hasText: "Daylight" }).getByRole("button", { name: "Use" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-icon-style", "smooth");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    if (process.env.PREVIEW_DIR) await profiles.screenshot({ path: `${process.env.PREVIEW_DIR}/style-profiles.png` });

    // A broken file is refused with a plain message.
    await profiles.getByTestId("style-import").setInputFiles({ name: "bad.meadhall", mimeType: "application/x-meadhall", buffer: Buffer.from("{nope") });
    await expect(profiles.getByRole("status")).toHaveText("That isn't a .meadhall file.");
});
