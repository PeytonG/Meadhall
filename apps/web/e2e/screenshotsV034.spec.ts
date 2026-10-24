// SPDX-License-Identifier: AGPL-3.0-only
// Screenshots of the v0.3.4 features for the README, into docs/screenshots. Run with:
//   CAPTURE_SCREENSHOTS=1 pnpm --dir apps/web exec playwright test screenshotsV034
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { SYNAPSE_URL, createRoom, joinRoom, sendEvent, sendMessage, sendState, setPresence, setProfileField, uploadMedia, type ApiUser } from "./support/matrixApi";
import { seedHall } from "./support/seedHall";
import { signIn } from "./support/ui";

test.skip(!process.env.CAPTURE_SCREENSHOTS, "Set CAPTURE_SCREENSHOTS=1 to capture README screenshots");
test.use({ viewport: { width: 1440, height: 900 } });

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(here, "..", "..", "..", "docs", "screenshots");

async function capture(target: Page | Locator, name: string): Promise<void> {
    const page = "page" in target ? target.page() : target;
    await page.waitForTimeout(600); // avatars, fonts and pixel art
    await target.screenshot({ path: path.join(OUTPUT, `${name}.png`) });
}

// A badge list for the screenshots, signed with the owner's real key when it's on this machine (served only to this
// test, never published): the coin only shows for lists signed with that key. Without it there's simply no coin.
function locallySignedBadges(userIds: string[]): string | null {
    const keyFile = path.join(process.env.MEADHALL_BADGE_DIR ?? path.join(os.homedir(), "Documents", "Meadhall-badge-signing"), "badge-signing-key.pem");
    if (!fs.existsSync(keyFile)) return null;
    const salt = crypto.randomBytes(16).toString("base64");
    const entries = Object.fromEntries(
        userIds.map((userId) => [crypto.pbkdf2Sync(userId, Buffer.from(salt, "base64"), 50_000, 32, "sha256").toString("base64url"), ["founder"]]),
    );
    const payload = JSON.stringify({ version: 1, issued: new Date().toISOString(), salt, iterations: 50_000, entries });
    const signature = crypto.sign("sha256", Buffer.from(payload), { key: fs.readFileSync(keyFile, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64");
    return JSON.stringify({ payload, signature });
}

async function hallChannelIds(user: ApiUser, spaceId: string): Promise<Record<string, string>> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v1/rooms/${encodeURIComponent(spaceId)}/hierarchy`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    const { rooms } = (await response.json()) as { rooms: Array<{ room_id: string; name?: string }> };
    return Object.fromEntries(rooms.filter((room) => room.room_id !== spaceId).map((room) => [room.name ?? "", room.room_id]));
}

// A short horn-like tone, so the shared sound has something in it.
function hornWav(): Buffer {
    const rate = 8000;
    const samples = rate;
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
    for (let index = 0; index < samples; index += 1) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 180 * index) / rate) * 12000), 44 + index * 2);
    return buffer;
}

test("captures the v0.3.4 screenshots", async ({ page }) => {
    test.setTimeout(300_000);
    const hall = await seedHall();
    const { hrothgar, beowulf, wealhtheow, wiglaf } = hall.users;

    // Roles, so the member list groups by rank.
    await sendState(hrothgar, hall.spaceId, "io.github.peytong.meadhall.roles", "", {
        roles: [
            { id: "thane", name: "Thane", color: "#f1c40f", rank: 60, permissions: ["kick", "ban", "manage_messages", "pin_messages"] },
            { id: "skald", name: "Skald", color: "#3498db", rank: 20, permissions: ["pin_messages"] },
            { id: "warrior", name: "Warrior", color: "#e74c3c", rank: 10, permissions: ["invite"] },
        ],
    });
    const give = (user: ApiUser, roles: string[]) => sendState(hrothgar, hall.spaceId, "io.github.peytong.meadhall.member_roles", `user:${user.userId}`, { roles });
    await give(hrothgar, ["thane"]);
    await give(wealhtheow, ["skald"]);
    await give(wiglaf, ["warrior"]);
    for (const user of [hrothgar, wealhtheow, wiglaf]) await setPresence(user, "online");

    // Channel types, a server banner, unread messages, nameplates, a card style and the founder coin.
    const channels = await hallChannelIds(hrothgar, hall.spaceId);
    await sendState(hrothgar, channels.announcements!, "io.github.peytong.meadhall.channel_type", "", { type: "news" });
    await sendState(hrothgar, hall.spaceId, "m.space.child", channels.announcements!, { via: ["localhost"], suggested: true, "org.heorot.channel_type": "news" });
    for (const [name, type] of [["rules", "rules"], ["faq", "faq"], ["feast-night", "events"]] as const) {
        const roomId = await createRoom(hrothgar, {
            name,
            preset: "private_chat",
            invite: [beowulf.userId],
            initial_state: [
                { type: "m.space.parent", state_key: hall.spaceId, content: { canonical: true, via: ["localhost"] } },
                { type: "io.github.peytong.meadhall.channel_type", state_key: "", content: { type } },
            ],
        });
        await sendState(hrothgar, hall.spaceId, "m.space.child", roomId, { via: ["localhost"], suggested: true, "org.heorot.channel_type": type });
        await joinRoom(beowulf, roomId);
        if (name === "feast-night") {
            await sendMessage(hrothgar, roomId, "Feast at sundown, bring your own horn!");
            await sendMessage(hrothgar, roomId, `${beowulf.username}: you are telling the saga tonight`);
        }
    }
    await sendMessage(wealhtheow, channels.sagas!, "New saga posted: the dragon's hoard.");
    const banner = await uploadMedia(hrothgar, fs.readFileSync(path.resolve(here, "../src/ui/assets/login-hall.webp")), "image/webp", "hall-banner.webp");
    await sendState(hrothgar, hall.spaceId, "io.github.peytong.meadhall.space_banner", "", { url: banner });
    await setProfileField(hrothgar, "io.github.peytong.meadhall.profile_style", { card: { preset: "mead" }, nameplate: { preset: "gold" } });
    await setProfileField(hrothgar, "io.github.peytong.meadhall.about", "King of the Danes and keeper of Heorot.");
    await setProfileField(wealhtheow, "io.github.peytong.meadhall.profile_style", { nameplate: { preset: "rose" } });
    await setProfileField(wiglaf, "io.github.peytong.meadhall.profile_style", { nameplate: { preset: "aurora" } });
    const badges = locallySignedBadges([hrothgar.userId]);
    await page.route("https://raw.githubusercontent.com/PeytonG/Meadhall/main/badges/badges.json", (route) =>
        badges ? route.fulfill({ status: 200, contentType: "application/json", body: badges }) : route.fulfill({ status: 404, body: "" }),
    );

    await signIn(page, hall.viewer);
    await page.getByTitle("The Mead Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    const membersButton = page.getByRole("button", { name: "Members panel" });
    if (!/is-active/.test((await membersButton.getAttribute("class")) ?? "")) await membersButton.click();
    await expect(page.getByTestId("space-banner").locator("img")).toBeVisible();
    await expect(page.locator(`.rs-member-row[data-user-id="${hrothgar.userId}"]`).getByTestId("nameplate")).toBeVisible({ timeout: 20_000 });
    if (badges) await expect(page.locator('[data-badge="founder"]').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".room-item").filter({ hasText: "feast-night" }).locator(".room-item-unread")).toBeVisible({ timeout: 20_000 });
    await capture(page, "server-features");

    // Right-click a server.
    await page.getByTitle("The Mead Hall").click({ button: "right" });
    await expect(page.getByRole("menu", { name: "The Mead Hall menu" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Notification settings" }).hover();
    await capture(page, "server-menu");
    await page.keyboard.press("Escape");

    // The inbox.
    await page.getByTestId("header-inbox").click();
    await expect(page.getByTestId("inbox-panel").getByTestId("inbox-conversation").first()).toBeVisible();
    await capture(page, "inbox");
    await page.keyboard.press("Escape");

    // A styled profile card with the founder coin.
    await page.locator(`.rs-member-row[data-user-id="${hrothgar.userId}"] .rs-member-select`).click();
    await expect(page.getByTestId("profile-card")).toHaveClass(/has-card-style/, { timeout: 20_000 });
    await capture(page.getByTestId("profile-card"), "profile-style");

    // Profile style in Settings.
    await page.getByRole("button", { name: "User settings", exact: true }).click();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    const styleSection = page.getByTestId("profile-style");
    await styleSection.getByRole("radiogroup", { name: "Profile card" }).getByRole("radio", { name: "Dusk" }).click();
    await styleSection.getByRole("radiogroup", { name: "Nameplate" }).getByRole("radio", { name: "Ocean" }).click();
    await styleSection.scrollIntoViewIfNeeded();
    await capture(styleSection, "profile-style-settings");

    // Sharing: the card a friend sees for a shared sound.
    await page.getByRole("button", { name: "Privacy & Safety", exact: true }).click();
    await page.getByTestId("sharing-toggle").check();
    await page.keyboard.press("Escape");
    const sound = { format: "meadhall", version: 1, kind: "sound", name: "War horn", emoji: "📯", mime: "audio/wav", audio: hornWav().toString("base64") };
    const file = await uploadMedia(hrothgar, Buffer.from(JSON.stringify(sound)), "application/x-meadhall", "War horn.meadhall");
    await sendEvent(hrothgar, hall.dmId, "m.room.message", {
        msgtype: "m.file",
        body: "War horn.meadhall",
        url: file,
        info: { mimetype: "application/x-meadhall" },
        "io.github.peytong.meadhall.share": { kind: "sound", name: "War horn", emoji: "📯" },
    });
    await page.getByTestId("rail-home").click();
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: "Hrothgar" }).click();
    await expect(page.getByTestId("share-card")).toBeVisible({ timeout: 20_000 });
    await capture(page, "sharing");
});
