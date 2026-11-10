// SPDX-License-Identifier: AGPL-3.0-only
// A small window: the chat header keeps the name readable and the call button clickable at every width (they used to
// overlap, so the call couldn't be started). Search, Pins, Members, Channel info and Help move into the ... menu.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, joinRoom, registerUser, setAccountData, setDisplayName } from "./support/matrixApi";
import { signIn } from "./support/ui";

async function headerProblems(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const problems: string[] = [];
        const title = document.querySelector(".channel-header-title")?.getBoundingClientRect();
        const row = document.querySelector(".channel-header-title-row");
        const actions = document.querySelector(".channel-header-actions")?.getBoundingClientRect();
        const header = document.querySelector(".channel-header")?.getBoundingClientRect();
        const call = document.querySelector("[data-testid=header-call]") as HTMLElement | null;
        if (!title || !row || !actions || !header) return ["no header"];
        if (title.width < 30) problems.push(`title only ${Math.round(title.width)}px`);
        for (const child of row.children) {
            const rect = child.getBoundingClientRect();
            if (rect.width > 0 && rect.right > actions.left + 1) problems.push(`${child.className} overlaps the buttons`);
        }
        if (actions.right > header.right + 1) problems.push("buttons run past the header");
        if (!call) {
            problems.push("no call button");
        } else {
            const rect = call.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            if (!hit || !call.contains(hit)) problems.push(`call button covered by ${hit?.className ?? "nothing"}`);
        }
        return problems;
    });
}

test("the chat header fits and the call button works at every window width", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(bob, "Hrothgar Healfdene's Son, King of the Danes");
    const dm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [alice.userId] });
    await joinRoom(alice, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await signIn(page, alice);
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().click();

    for (const width of [1400, 1280, 1100, 1000, 900, 820, 761]) {
        await page.setViewportSize({ width, height: 720 });
        await expect.poll(() => headerProblems(page), { message: `at ${width}px` }).toEqual([]);
    }

    // Narrow: the moved buttons are in the ... menu and work from there.
    await expect(page.getByRole("button", { name: "Members panel" })).toBeHidden();
    await page.getByRole("button", { name: "More channel actions" }).click();
    const menu = page.getByRole("menu");
    for (const item of ["Search messages", "Members", "Pinned messages", "Shared notes", "Channel info", "Help"]) {
        await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
    }
    await menu.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    // Wide again: the buttons are back in the bar, not in the menu.
    await page.setViewportSize({ width: 1400, height: 720 });
    await expect(page.getByRole("button", { name: "Members panel" })).toBeVisible();
    await page.getByRole("button", { name: "More channel actions" }).click();
    await expect(page.getByRole("menu").getByRole("menuitem", { name: "Channel info" })).toBeHidden();
});
