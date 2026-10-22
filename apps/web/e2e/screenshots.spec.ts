// SPDX-License-Identifier: AGPL-3.0-only
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import {
    createRoom,
    joinRoom,
    registerUser,
    sendMessage,
    sendState,
    setDisplayName,
    type ApiUser,
} from "./support/matrixApi";
import { signIn, waitForAppShell } from "./support/ui";

// Captures the README screenshots into docs/screenshots. Run with:
//   CAPTURE_SCREENSHOTS=1 pnpm --dir apps/web exec playwright test screenshots
test.skip(!process.env.CAPTURE_SCREENSHOTS, "Set CAPTURE_SCREENSHOTS=1 to capture README screenshots");
test.use({ viewport: { width: 1440, height: 900 } });

const OUTPUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "screenshots");

async function capture(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(500); // let avatars and fonts settle
    await page.screenshot({ path: path.join(OUTPUT, `${name}.png`) });
}

async function seedHall(): Promise<ApiUser> {
    const [hrothgar, beowulf, wealhtheow, wiglaf] = await Promise.all(
        ["hrothgar", "beowulf", "wealhtheow", "wiglaf"].map((name) => registerUser(name)),
    );
    await Promise.all([
        setDisplayName(hrothgar, "Hrothgar"),
        setDisplayName(beowulf, "Beowulf"),
        setDisplayName(wealhtheow, "Wealhtheow"),
        setDisplayName(wiglaf, "Wiglaf"),
    ]);
    const guests = [beowulf, wealhtheow, wiglaf];
    const spaceId = await createRoom(hrothgar, {
        name: "The Mead Hall",
        preset: "private_chat",
        creation_content: { type: "m.space" },
        invite: guests.map((guest) => guest.userId),
    });

    const channel = async (name: string, topic: string, voice = false): Promise<string> => {
        const roomId = await createRoom(hrothgar, {
            name,
            topic,
            preset: "private_chat",
            invite: guests.map((guest) => guest.userId),
            initial_state: [
                { type: "m.space.parent", state_key: spaceId, content: { canonical: true, via: ["localhost"] } },
                ...(voice
                    ? [
                          { type: "org.heorot.voice_channel", state_key: "", content: { enabled: true, version: 1 } },
                          { type: "org.matrix.msc3401.call", state_key: "", content: { type: "voice", intent: "voice" } },
                      ]
                    : []),
            ],
        });
        await sendState(hrothgar, spaceId, "m.space.child", roomId, {
            via: ["localhost"],
            suggested: true,
            ...(voice ? { "org.heorot.channel_type": "voice", "org.heorot.voice_channel": true } : {}),
        });
        for (const guest of guests) await joinRoom(guest, roomId);
        return roomId;
    };

    for (const guest of guests) await joinRoom(guest, spaceId);
    const general = await channel("general", "Gather round the hearth");
    await channel("announcements", "News from the high seat");
    await channel("sagas", "Tales worth retelling");
    await channel("Fireside", "Voice chat by the fire", true);

    const conversation: Array<[ApiUser, string]> = [
        [hrothgar, "Welcome to the hall, everyone. The mead is poured and the fire is lit."],
        [beowulf, "Glad to be here! Voice works with Element Call too, so bring your friends."],
        [wealhtheow, "The pixel color wheel is great: I set my hall to crimson."],
        [wiglaf, "Anyone up for a game in the Fireside channel later?"],
        [hrothgar, "Count me in. Messages and calls here are end-to-end encrypted, as a hall should be."],
        [beowulf, "Then it's settled: Fireside at sundown."],
    ];
    for (const [author, text] of conversation) await sendMessage(author, general, text);
    return beowulf;
}

test("captures README screenshots", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Meadhall" })).toBeVisible();
    await capture(page, "login");

    const viewer = await seedHall();
    await signIn(page, viewer);
    await page.getByTitle("The Mead Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    await expect(page.getByText("Then it's settled: Fireside at sundown.")).toBeVisible();
    await capture(page, "chat-dark");

    await page.locator(".pane-user-card").click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    const colorCard = page.locator(".settings-section-card", { has: page.getByRole("heading", { name: "Theme color" }) });
    await colorCard.scrollIntoViewIfNeeded();
    await expect(colorCard.locator(".pixel-color-wheel")).toBeVisible();
    await capture(page, "theme-color-wheel");
    await page.keyboard.press("Escape");

    // Switch to the light theme through the stored appearance setting.
    await page.evaluate(() => {
        const key = "heorot.user_settings.v1";
        const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
        settings.appearance = { ...(settings.appearance ?? {}), theme: "light" };
        localStorage.setItem(key, JSON.stringify(settings));
    });
    await page.reload();
    await waitForAppShell(page);
    await page.getByTitle("The Mead Hall").click();
    await page.getByText("#general", { exact: true }).first().click();
    await expect(page.getByText("Then it's settled: Fireside at sundown.")).toBeVisible();
    await capture(page, "chat-light");
});
