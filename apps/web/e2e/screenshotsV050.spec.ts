// SPDX-License-Identifier: AGPL-3.0-only
// Screenshots of the v0.5.0 features for the README, into docs/screenshots, in the smooth look (see SMOOTH_LOOK).
// Run with:
//   CAPTURE_SCREENSHOTS=1 pnpm --dir apps/web exec playwright test screenshotsV050
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendMessage, sendState, setAccountData, setDisplayName, SYNAPSE_URL, type ApiUser } from "./support/matrixApi";
import { seedHall } from "./support/seedHall";
import { signIn } from "./support/ui";

test.skip(!process.env.CAPTURE_SCREENSHOTS, "Set CAPTURE_SCREENSHOTS=1 to capture README screenshots");
test.use({ viewport: { width: 1440, height: 900 } });

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(here, "..", "..", "..", "docs", "screenshots");

async function capture(target: Page | Locator, name: string): Promise<void> {
    const page = "page" in target ? target.page() : target;
    await page.waitForTimeout(700); // avatars and fonts
    await target.screenshot({ path: path.join(OUTPUT, `${name}.png`) });
}

async function send(user: ApiUser, roomId: string, body: string): Promise<string> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${crypto.randomUUID()}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${user.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "m.text", body }),
    });
    return ((await response.json()) as { event_id: string }).event_id;
}

const link = (roomId: string, eventId: string): string => `meadhall://room/${encodeURIComponent(roomId)}/${encodeURIComponent(eventId)}`;

test("captures the v0.5.0 screenshots", async ({ page, browser }) => {
    test.setTimeout(300_000);
    const hall = await seedHall();
    const { hrothgar, beowulf, wealhtheow, wiglaf } = hall.users;

    // A message link with its preview card.
    const feast = await send(wealhtheow, hall.generalId, "The feast starts at sundown. Bring your own horn!");
    await sendMessage(beowulf, hall.generalId, `Don't miss this: ${link(hall.generalId, feast)}`);

    // Reasons and a report, for Space Settings → Reports.
    await sendState(hrothgar, hall.spaceId, "io.github.peytong.meadhall.report_reasons", "", {
        reasons: [
            { id: "promo", label: "Unauthorized self-promotion" },
            { id: "language", label: "Curse words" },
            { id: "harassment", label: "Harassment" },
        ],
    });
    const spam = await send(wiglaf, hall.generalId, "Buy my mead at mead-deals.example, 50% off today!");
    await createRoom(wealhtheow, {
        name: "Report: Wiglaf",
        preset: "private_chat",
        invite: [hrothgar.userId],
        creation_content: { type: "io.github.peytong.meadhall.report" },
        initial_state: [
            {
                type: "io.github.peytong.meadhall.report",
                state_key: "",
                content: {
                    space: hall.spaceId,
                    reported_user: wiglaf.userId,
                    reason_id: "promo",
                    reason: "Unauthorized self-promotion",
                    note: "Third time today in #general.",
                    room_id: hall.generalId,
                    event_id: spam,
                    excerpt: "Buy my mead at mead-deals.example, 50% off today!",
                },
            },
            { type: "m.room.history_visibility", state_key: "", content: { history_visibility: "shared" } },
        ],
        power_level_content_override: { users: { [hrothgar.userId]: 50 } },
    });

    // Onboarding, for a newcomer.
    await sendState(hrothgar, hall.spaceId, "io.github.peytong.meadhall.onboarding", "", {
        enabled: true,
        intro: "Welcome to the Mead Hall! Read the rules and tell us a little about yourself.",
        rules: ["Be kind to fellow travellers.", "No spam or self-promotion.", "Keep spoilers in #sagas."],
        questions: [
            {
                id: "why",
                prompt: "What brings you to the hall?",
                multiple: true,
                required: true,
                answers: [
                    { id: "stories", label: "Stories and sagas" },
                    { id: "games", label: "Games night" },
                    { id: "music", label: "Music by the fire" },
                ],
            },
        ],
        member_role_id: null,
        gate: "soft",
        welcome: { enabled: false, channel_id: null, message: "" },
    });

    // 1. The space owner: the link preview, then Reports.
    await signIn(page, hrothgar);
    await page.getByTitle("The Mead Hall").click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    const preview = page.getByTestId("app-link-preview").first();
    await expect(preview).toContainText("The feast starts at sundown");
    await preview.scrollIntoViewIfNeeded();
    await capture(page.locator(".main-pane, .main-chat").first(), "app-link-preview");

    await page.getByRole("button", { name: "Space settings", exact: true }).click();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    const report = page.getByTestId("mod-report").filter({ hasText: "Wiglaf" });
    await expect(report).toBeVisible({ timeout: 30_000 });
    await report.locator(".mod-report-summary").click();
    await expect(report.getByText("Third time today")).toBeVisible();
    await capture(page.locator(".settings-shell"), "reports");
    await page.keyboard.press("Escape");

    // 2. A newcomer: onboarding.
    const newcomer = await registerUser("eadgils");
    await setDisplayName(newcomer, "Eadgils");
    await sendState(hrothgar, hall.spaceId, "m.room.join_rules", "", { join_rule: "public" });
    await sendState(hrothgar, hall.generalId, "m.room.join_rules", "", { join_rule: "public" });
    await joinRoom(newcomer, hall.spaceId);
    await joinRoom(newcomer, hall.generalId);
    const newcomerPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await signIn(newcomerPage, newcomer);
    // Entering the space opens onboarding on its own.
    await newcomerPage.getByTitle("The Mead Hall").click();
    await expect(newcomerPage.getByTestId("onboarding-dialog")).toBeVisible({ timeout: 30_000 });
    await newcomerPage.getByText("Games night").click();
    await capture(newcomerPage.locator(".room-dialog").first(), "onboarding");
    await newcomerPage.close();

    // 3. Someone signing in for the first time: the look picker (here switched to Smooth).
    const fresh = await registerUser("ongentheow");
    await setDisplayName(fresh, "Ongentheow");
    await setAccountData(fresh, "io.github.peytong.meadhall.appearance", {});
    const freshPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await signIn(freshPage, fresh);
    await expect(freshPage.getByTestId("look-picker")).toBeVisible();
    await freshPage.getByTestId("look-smooth").click();
    await capture(freshPage.locator(".room-dialog").first(), "look-picker");
    await freshPage.close();
});
