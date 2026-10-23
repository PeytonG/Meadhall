// SPDX-License-Identifier: AGPL-3.0-only
// Captures the feature screenshots for the README and docs/SCREENSHOTS.md into docs/screenshots. Run with:
//   CAPTURE_SCREENSHOTS=1 pnpm --dir apps/web exec playwright test screenshotsShowcase
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
    registerAdmin,
    sendMessage,
    sendState,
    setPresence,
    setProfileField,
    uploadMedia,
} from "./support/matrixApi";
import { seedHall, type SeededHall } from "./support/seedHall";
import { signIn, waitForAppShell } from "./support/ui";

test.skip(!process.env.CAPTURE_SCREENSHOTS, "Set CAPTURE_SCREENSHOTS=1 to capture README screenshots");
test.use({ viewport: { width: 1440, height: 900 } });

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(here, "..", "..", "..", "docs", "screenshots");
const STATUS_KEY = "io.github.peytong.meadhall.status";

async function settle(page: Page): Promise<void> {
    await page.waitForTimeout(600); // avatars, fonts and pixel art
}

async function capture(target: Page | Locator, name: string): Promise<void> {
    const page = "page" in target ? target.page() : target;
    await settle(page);
    await target.screenshot({ path: path.join(OUTPUT, `${name}.png`) });
}

// Two images side by side on a dark backdrop (e.g. the campfire on and off).
async function sideBySide(page: Page, name: string, left: Buffer, right: Buffer, labels: [string, string]): Promise<void> {
    const image = (buffer: Buffer, label: string): string =>
        `<figure style="margin:0;text-align:center;color:#e3e5e8;font:600 18px system-ui">` +
        `<img src="data:image/png;base64,${buffer.toString("base64")}" style="display:block;height:300px;image-rendering:pixelated;margin:0 auto">` +
        `<figcaption style="margin-top:10px">${label}</figcaption></figure>`;
    await page.setViewportSize({ width: 1200, height: 520 });
    await page.setContent(
        `<body style="margin:0;background:#0b0b0f;display:flex;gap:120px;justify-content:center;align-items:center;min-height:100vh">` +
            image(left, labels[0]) +
            image(right, labels[1]) +
            `</body>`,
    );
    await page.screenshot({ path: path.join(OUTPUT, `${name}.png`), fullPage: true });
}

async function openSpaceChannel(page: Page, channel = "general"): Promise<void> {
    await page.getByTitle("The Mead Hall").click();
    await page.getByText(`#${channel}`, { exact: true }).first().click();
}

// Roles in the hall, a profile worth looking at, and people's statuses.
async function dressUpHall(hall: SeededHall): Promise<void> {
    const { hrothgar, beowulf, wealhtheow, wiglaf } = hall.users;
    await sendState(hrothgar, hall.spaceId, "io.github.peytong.meadhall.roles", "", {
        roles: [
            { id: "thane", name: "Thane", color: "#f1c40f", rank: 60, permissions: ["kick", "ban", "manage_messages", "pin_messages"] },
            { id: "skald", name: "Skald", color: "#3498db", rank: 20, permissions: ["pin_messages"] },
            { id: "warrior", name: "Warrior", color: "#e74c3c", rank: 10, permissions: ["invite"] },
        ],
    });
    const give = (user: typeof beowulf, roles: string[]) =>
        sendState(hrothgar, hall.spaceId, "io.github.peytong.meadhall.member_roles", `user:${user.userId}`, { roles });
    await give(beowulf, ["thane", "warrior"]);
    await give(wealhtheow, ["skald"]);
    await give(wiglaf, ["warrior"]);

    const banner = await uploadMedia(hrothgar, fs.readFileSync(path.resolve(here, "../src/ui/assets/login-hall.webp")), "image/webp", "banner.webp");
    await setProfileField(hrothgar, "io.github.peytong.meadhall.banner", banner);
    await setProfileField(hrothgar, "io.github.peytong.meadhall.about", "King of the Danes and keeper of Heorot. The mead is always flowing.");
    await setProfileField(hrothgar, "io.github.peytong.meadhall.links", [
        { label: "Saga", url: "https://en.wikipedia.org/wiki/Beowulf" },
        { label: "GitHub", url: "https://github.com/PeytonG/Meadhall" },
    ]);
    await setProfileField(hrothgar, STATUS_KEY, { state: null, platform: "desktop", activity: { name: "Stardew Valley", since: Date.now() } });
    await setPresence(hrothgar, "online");
    await setProfileField(wealhtheow, STATUS_KEY, { state: null, platform: "mobile" });
    await setPresence(wealhtheow, "online", "Pouring the mead");
    await setProfileField(wiglaf, STATUS_KEY, { state: "dnd", platform: "desktop" });
    await setPresence(wiglaf, "unavailable", "Sharpening swords");
    await sendMessage(hrothgar, hall.dmId, "The hall is yours tonight. Guard it well.");
}

test("captures the feature screenshots", async ({ page, browser }) => {
    test.setTimeout(300_000);
    const hall = await seedHall();
    await dressUpHall(hall);
    await signIn(page, hall.viewer);

    // Direct messages: status and the latest message under each name.
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: "Hrothgar" }).click();
    await expect(page.locator(".timeline").getByText("Guard it well.")).toBeVisible();
    await capture(page, "direct-messages");

    // A profile: banner, about, links and roles in mutual servers.
    await page.locator(".timeline").getByText("Hrothgar", { exact: true }).first().click();
    await expect(page.getByTestId("profile-roles")).toBeVisible();
    await expect.poll(() => page.getByTestId("profile-banner").locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await capture(page, "profile");

    // Spaces with role colors in the member list.
    await openSpaceChannel(page);
    await expect(page.locator(".timeline").getByText("Then it's settled: Fireside at sundown.")).toBeVisible();
    await capture(page, "space-roles");

    // The status menu: custom status, Online / Away / DND / Invisible, and other accounts.
    await page.getByTestId("user-card").click();
    await page.getByTestId("status-text").fill("Guarding the hall");
    await capture(page, "status-menu");
    await page.getByRole("menuitemradio", { name: /^Online/ }).click();

    // Settings: the campfire on and off, the soundboard and voice changer.
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    const campfire = page.locator(".settings-section-card", { has: page.getByRole("heading", { name: "Speaking campfire" }) });
    await campfire.scrollIntoViewIfNeeded();
    await settle(page);
    const preview = campfire.locator(".settings-campfire-preview");
    // The flames and ring reach outside the preview box, so take a margin around it.
    const around = async (): Promise<Buffer> => {
        const box = (await preview.boundingBox())!;
        return page.screenshot({ clip: { x: box.x - 40, y: box.y - 40, width: box.width + 80, height: box.height + 80 } });
    };
    const flames = await around();
    await campfire.getByTestId("campfire-toggle").uncheck();
    await settle(page);
    const ring = await around();
    await campfire.getByTestId("campfire-toggle").check();
    const voiceChanger = page.locator(".settings-section-card", { has: page.getByRole("heading", { name: "Voice changer" }) });
    await voiceChanger.scrollIntoViewIfNeeded();
    await capture(voiceChanger, "voice-changer");
    const soundboard = page.locator(".settings-section-card", { has: page.getByRole("heading", { name: "Soundboard" }) });
    await soundboard.scrollIntoViewIfNeeded();
    await capture(soundboard, "soundboard");
    await page.keyboard.press("Escape");

    // High contrast.
    await page.evaluate(() => {
        const key = "heorot.user_settings.v1";
        const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
        settings.appearance = { ...(settings.appearance ?? {}), theme: "contrast" };
        localStorage.setItem(key, JSON.stringify(settings));
    });
    await page.reload();
    await waitForAppShell(page);
    await openSpaceChannel(page);
    await expect(page.locator(".timeline").getByText("Then it's settled: Fireside at sundown.")).toBeVisible();
    await capture(page, "chat-high-contrast");

    const scratch = await browser.newPage();
    await sideBySide(scratch, "campfire", flames, ring, ["Campfire on: flames while you speak", "Campfire off: a simple ring"]);
    await scratch.close();
});

test("captures the roles editor", async ({ page }) => {
    test.setTimeout(180_000);
    const hall = await seedHall();
    await dressUpHall(hall);
    await signIn(page, hall.users.hrothgar);
    await page.getByTitle("The Mead Hall").click();
    await page.getByRole("button", { name: "Server", exact: true }).click();
    await page.getByRole("button", { name: "Members", exact: true }).click();
    await expect(page.getByTestId("roles-section")).toBeVisible();
    await page.getByTestId("roles-section").locator(".roles-editor summary").first().click();
    await capture(page, "roles-editor");
    const access = page.getByTestId("channel-access-section");
    await access.scrollIntoViewIfNeeded();
    await access.getByRole("combobox", { name: "Who can talk in #announcements" }).selectOption({ label: "Thane and above" });
    await expect(page.getByText("Only Thane and above can talk in #announcements.")).toBeVisible({ timeout: 15_000 });
    await capture(access, "channel-access");
});

test("captures sign-up with a registration token and the admin panel", async ({ page }) => {
    // The test server allows open sign-up; answer the sign-up probe like a token-only server does.
    await page.route("**/_matrix/client/v3/register", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await route.fulfill({ status: 401, json: { session: "s", flows: [{ stages: ["m.login.registration_token"] }], params: {} } });
    });
    await page.goto("/");
    await page.locator(".login-mode-switch button").nth(1).click();
    // Show a believable server address rather than the test server.
    await page.route("https://meadhall.example.org/**", async (route) => {
        const url = route.request().url();
        if (url.includes("/.well-known/")) return route.fulfill({ status: 404, body: "" });
        if (url.includes("/_matrix/client/versions")) return route.fulfill({ json: { versions: ["v1.11"] } });
        if (url.includes("/register")) {
            return route.fulfill({ status: 401, json: { session: "s", flows: [{ stages: ["m.login.registration_token"] }], params: {} } });
        }
        return route.fulfill({ json: {} });
    });
    await page.getByLabel("Homeserver").fill("https://meadhall.example.org");
    await page.getByLabel("Username").fill("beowulf");
    await expect(page.getByLabel("Registration token")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Registration token").fill("mead-hall-2026");
    await capture(page, "sign-up-token");
    await page.unroute("**/_matrix/client/v3/register");

    const admin = await registerAdmin("thane");
    await signIn(page, admin);
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Server admin", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Server admin" })).toBeVisible();
    // One invite code to show, and only this run's admin in the user list (the test server has many accounts).
    await page.getByRole("button", { name: "Create token" }).click();
    await expect(page.getByText("No tokens yet.")).toBeHidden({ timeout: 15_000 });
    await page.getByPlaceholder("Name or username").last().fill(admin.username);
    await capture(page, "admin-panel");
});
