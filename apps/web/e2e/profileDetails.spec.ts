// SPDX-License-Identifier: AGPL-3.0-only
// Banner (image or GIF), About me, public email and links: edited in Settings → Profile, saved to the Matrix profile,
// and shown on the profile card other people see.
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
