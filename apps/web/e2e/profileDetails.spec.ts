// SPDX-License-Identifier: AGPL-3.0-only
// Banner (image or GIF), About me, public email and links: edited in Settings → Profile, saved to the Matrix profile,
// and shown on the profile card other people see.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { createRoom, joinRoom, readProfileField, registerUser, sendMessage, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

// A 1x1 GIF.
const GIF = Buffer.from("R0lGODlhAQABAIAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

test("profile banner, About me, email and links are saved and shown on the profile", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(alice, "Alice");
    const dm = await createRoom(alice, { is_direct: true, preset: "trusted_private_chat", invite: [bob.userId] });
    await joinRoom(bob, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await sendMessage(alice, dm, "Look at my new banner");
    await signIn(page, alice);

    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    const details = page.getByTestId("profile-details");
    await details.getByTestId("banner-input").setInputFiles({ name: "banner.gif", mimeType: "image/gif", buffer: GIF });
    await expect(details.locator(".settings-banner-preview img")).toBeVisible({ timeout: 15_000 });
    await details.getByLabel("About me").fill("Skald of Heorot. I sing of monsters.");
    await details.getByLabel("Email on your profile").fill("alice@example.org");
    await details.getByRole("button", { name: "Add link" }).click();
    await details.getByLabel("Link 1 name").fill("GitHub");
    await details.getByLabel("Link 1 address").fill("javascript:alert(1)");
    await expect(details.getByText("Links must be web addresses")).toBeVisible();
    await expect(details.getByRole("button", { name: "Save details" })).toBeDisabled();
    await details.getByLabel("Link 1 address").fill("github.com/alice");
    await details.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Profile details saved.")).toBeVisible();

    // Stored in the public profile, where other apps and people can read it.
    expect(await readProfileField(bob, alice.userId, "io.github.peytong.meadhall.about")).toBe("Skald of Heorot. I sing of monsters.");
    expect(await readProfileField(bob, alice.userId, "io.github.peytong.meadhall.links")).toEqual([
        { label: "GitHub", url: "https://github.com/alice" },
    ]);
    expect(String(await readProfileField(bob, alice.userId, "io.github.peytong.meadhall.banner"))).toMatch(/^mxc:\/\//);

    await page.keyboard.press("Escape");
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().click();
    await page.locator(".timeline").getByText("Alice", { exact: true }).first().click();
    const banner = page.getByTestId("profile-banner").locator("img");
    await expect.poll(() => banner.evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText("Skald of Heorot. I sing of monsters.")).toBeVisible();
    const links = page.getByTestId("profile-links");
    await expect(links.getByRole("link", { name: "alice@example.org" })).toHaveAttribute("href", "mailto:alice@example.org");
    await expect(links.getByRole("link", { name: "github.com/alice" })).toHaveAttribute("href", "https://github.com/alice");
});

test("the banner preview matches the profile card exactly, and can be cropped", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(alice, "Alice");
    const dm = await createRoom(alice, { is_direct: true, preset: "trusted_private_chat", invite: [bob.userId] });
    await joinRoom(bob, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await sendMessage(alice, dm, "new banner");
    await signIn(page, alice);

    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    const details = page.getByTestId("profile-details");
    const square = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/assets/meadhall-icon.png"));
    await details.getByTestId("banner-input").setInputFiles({ name: "square.png", mimeType: "image/png", buffer: square });
    const preview = details.getByTestId("banner-preview");
    await expect(preview.locator("img")).toBeVisible({ timeout: 15_000 });

    // Zoom in and drag the picture to the left (shows more of its right side).
    await details.getByTestId("banner-zoom").fill("2");
    const box = (await preview.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - box.width * 0.2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    const previewStyle = await preview.locator("img").evaluate((image) => ({ position: image.style.objectPosition, transform: image.style.transform }));
    expect(previewStyle.transform).toBe("scale(2)");
    expect(previewStyle.position).toBe("70% 50%");
    await details.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Profile details saved.")).toBeVisible();
    expect(await readProfileField(bob, alice.userId, "io.github.peytong.meadhall.banner_crop")).toEqual({ x: 70, y: 50, zoom: 2 });

    // The card: same shape and the same crop as the preview.
    const previewRatio = box.width / box.height;
    await page.keyboard.press("Escape");
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().click();
    await page.locator(".timeline").getByText("Alice", { exact: true }).first().click();
    const banner = page.getByTestId("profile-banner");
    const cardBox = (await banner.boundingBox())!;
    expect(cardBox.width / cardBox.height).toBeCloseTo(previewRatio, 1);
    expect(await banner.locator("img").evaluate((image) => ({ position: image.style.objectPosition, transform: image.style.transform }))).toEqual(previewStyle);
    if (process.env.PREVIEW_DIR) await banner.screenshot({ path: `${process.env.PREVIEW_DIR}/banner-card.png` });
});
