// SPDX-License-Identifier: AGPL-3.0-only
// Someone invited to a space with onboarding (not joined beforehand) accepts the invite in Meadhall and is held at
// onboarding, in the space and when a channel is opened straight from a link or notification.
import { expect, test } from "@playwright/test";

import { createRoom, invite, registerUser, sendState } from "./support/matrixApi";
import { signIn } from "./support/ui";

const ONBOARDING = {
    enabled: true,
    intro: "Welcome!",
    rules: ["Be kind"],
    questions: [],
    member_role_id: null,
    gate: "soft",
    welcome: { enabled: false, channel_id: null, message: "" },
};

test("people invited to a space go through its onboarding", async ({ page }) => {
    const owner = await registerUser("owner");
    const guest = await registerUser("guest");
    const spaceName = `Invite Hall ${Date.now().toString(36)}`;
    const spaceId = await createRoom(owner, { name: spaceName, preset: "private_chat", creation_content: { type: "m.space" } });
    const channelId = await createRoom(owner, {
        name: "general",
        preset: "private_chat",
        initial_state: [{ type: "m.space.parent", state_key: spaceId, content: { canonical: true, via: ["localhost"] } }],
    });
    await sendState(owner, spaceId, "m.space.child", channelId, { via: ["localhost"], suggested: true });
    // Members may write their own answers (what Space Settings → Onboarding sets up).
    await sendState(owner, spaceId, "io.github.peytong.meadhall.onboarding", "", ONBOARDING);
    await invite(owner, spaceId, guest.userId);
    await invite(owner, channelId, guest.userId);

    await signIn(page, guest);
    await page.getByTitle(spaceName).click();
    // The space is offered as an invite (its channels aren't joined behind your back); accepting joins it.
    await expect(page.getByTestId("space-invite-card")).toContainText(spaceName);
    await page.getByTestId("space-invite-accept").click();
    await expect(page.getByTestId("onboarding-dialog")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Later" }).click();
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    await expect(page.getByTestId("onboarding-gate")).toBeVisible();
});
