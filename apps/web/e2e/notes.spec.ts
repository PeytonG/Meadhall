// SPDX-License-Identifier: AGPL-3.0-only
// Shared notes (§10.8 #7): folders inside folders, several notes, and two people editing the same note at the same
// time, in an encrypted DM and in a space. Each note holds at most 0.3 MB. The notes room never shows up as a chat
// and never notifies.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, createSpaceWithChannel, joinRoom, registerUser, setAccountData, SYNAPSE_URL, type ApiUser } from "./support/matrixApi";
import { signIn } from "./support/ui";

async function encryptedDm(alice: ApiUser, bob: ApiUser): Promise<string> {
    const dm = await createRoom(alice, {
        is_direct: true,
        preset: "trusted_private_chat",
        invite: [bob.userId],
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await joinRoom(bob, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await setAccountData(bob, "m.direct", { [alice.userId]: [dm] });
    return dm;
}

async function openDmNotes(page: Page): Promise<void> {
    await page.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").first().click();
    await page.getByTestId("header-notes").click();
    await expect(page.getByTestId("notes-view")).toBeVisible();
}

const noteText = (page: Page) => page.getByTestId("note-text");

// Room IDs in this user's notification list (what their phone would show).
async function notifiedRooms(user: ApiUser): Promise<string[]> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/notifications?limit=100`, { headers: { Authorization: `Bearer ${user.accessToken}` } });
    const body = (await response.json()) as { notifications: Array<{ room_id: string; event: { type: string; content?: { membership?: string } } }> };
    return body.notifications.filter((item) => item.event.content?.membership !== "invite").map((item) => item.room_id);
}

test("two people share notes in a DM: nested folders, several notes, editing at the same time", async ({ page, browser }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    const dm = await encryptedDm(alice, bob);
    // Both signed in first, so Alice's encrypted edits are shared with Bob's device.
    const bobPage = await (await browser.newContext()).newPage();
    await signIn(page, alice);
    await signIn(bobPage, bob);

    // Alice starts the notes: a folder, a folder inside it, and a note inside that.
    await openDmNotes(page);
    await page.getByTestId("notes-create").click();
    await page.getByTestId("notes-new-folder").click();
    await page.getByLabel("Folder name").fill("Projects");
    await page.getByLabel("Folder name").press("Enter");
    await page.getByTestId("notes-new-folder").click();
    await page.getByLabel("Folder name").fill("Brewing");
    await page.getByLabel("Folder name").press("Enter");
    await page.getByTestId("notes-new-note").click();
    await page.getByRole("textbox", { name: "Note title" }).first().fill("Mead recipe");
    await page.getByRole("textbox", { name: "Note title" }).first().press("Enter");
    await noteText(page).fill("Honey, water, yeast.");
    await page.getByTestId("notes-new-note").click();
    await page.getByRole("textbox", { name: "Note title" }).first().fill("Shopping list");
    await page.getByRole("textbox", { name: "Note title" }).first().press("Enter");
    await noteText(page).fill("Three jars of honey");
    await expect(page.getByTestId("note-status")).toContainText("Saved", { timeout: 15_000 });

    // Bob's Meadhall accepted the notes room's invite by itself: no invite to answer.
    await bobPage.waitForTimeout(3_000);
    await expect(bobPage.getByTestId("home-invite")).toHaveCount(0);

    // Bob opens the notes from the same DM and finds the same tree (folders open on click).
    await openDmNotes(bobPage);
    const bobTree = bobPage.getByTestId("notes-tree");
    await bobTree.getByTestId("notes-folder").filter({ hasText: "Projects" }).click({ timeout: 30_000 });
    await bobTree.getByTestId("notes-folder").filter({ hasText: "Brewing" }).click();
    await expect(bobTree.getByTestId("notes-note")).toHaveCount(2);
    await bobTree.getByTestId("notes-note").filter({ hasText: "Mead recipe" }).click();
    await expect(noteText(bobPage)).toHaveValue("Honey, water, yeast.", { timeout: 30_000 });

    // Both type in the same note at once: Alice at the end, Bob at the start. Both end up with both changes.
    await page.getByTestId("notes-note").filter({ hasText: "Mead recipe" }).click();
    await expect(noteText(page)).toHaveValue("Honey, water, yeast.");
    await noteText(page).click();
    await page.keyboard.press("Control+End");
    await noteText(bobPage).click();
    await bobPage.keyboard.press("Control+Home");
    await Promise.all([page.keyboard.type(" Boil for an hour.", { delay: 20 }), bobPage.keyboard.type("Batch 2: ", { delay: 20 })]);
    const merged = "Batch 2: Honey, water, yeast. Boil for an hour.";
    await expect(noteText(page)).toHaveValue(merged, { timeout: 30_000 });
    await expect(noteText(bobPage)).toHaveValue(merged, { timeout: 30_000 });
    await expect(bobPage.getByTestId("note-status")).toContainText("Last edited by", { timeout: 15_000 });
    if (process.env.PREVIEW_DIR) {
        await page.screenshot({ path: `${process.env.PREVIEW_DIR}/notes-alice.png` });
        await bobPage.screenshot({ path: `${process.env.PREVIEW_DIR}/notes-bob.png` });
    }

    // Bob moves the shopping list to the top level; Alice sees it move.
    const shopping = bobTree.getByTestId("notes-note").filter({ hasText: "Shopping list" });
    await shopping.hover();
    await bobPage.getByRole("button", { name: "More for Shopping list" }).click();
    await bobPage.getByLabel("Move to").selectOption({ label: "Top level" });
    await expect(page.getByTestId("notes-tree").locator(":scope > li").filter({ hasText: "Shopping list" })).toBeVisible({ timeout: 30_000 });

    // Everything is still there after reloading (saved in the notes room, not just in memory).
    await page.waitForTimeout(9_000);
    await bobPage.reload();
    await openDmNotes(bobPage);
    await bobPage.getByTestId("notes-folder").filter({ hasText: "Projects" }).click({ timeout: 30_000 });
    await bobPage.getByTestId("notes-folder").filter({ hasText: "Brewing" }).click();
    await bobPage.getByTestId("notes-note").filter({ hasText: "Mead recipe" }).click();
    await expect(noteText(bobPage)).toHaveValue(merged, { timeout: 30_000 });

    // The notes room isn't a chat and never notifies: Bob's Direct Messages still show just Alice, and none of
    // Alice's edits are in his notifications.
    expect((await notifiedRooms(bob)).filter((roomId) => roomId !== dm)).toEqual([]);
    await bobPage.getByTestId("notes-close").click();
    await bobPage.getByTestId("rail-home").click();
    await expect(bobPage.getByRole("region", { name: "Direct messages" }).getByTestId("home-row")).toHaveCount(1);
});

test("a note can't grow past 0.3 MB", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await encryptedDm(alice, bob);
    await signIn(page, alice);
    await openDmNotes(page);
    await page.getByTestId("notes-create").click();
    await page.getByTestId("notes-new-note").click();
    await page.getByRole("textbox", { name: "Note title" }).first().press("Enter");
    await noteText(page).fill("x".repeat(299_000));
    await expect(page.getByTestId("note-size")).toHaveText("299 KB of 300 KB");
    // Pasting more would go over: refused, with a message; the note keeps what it had.
    await noteText(page).evaluate((element: HTMLTextAreaElement) => {
        element.value = `${element.value}${"y".repeat(5_000)}`;
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.getByTestId("note-too-big")).toBeVisible();
    expect(await noteText(page).evaluate((element: HTMLTextAreaElement) => element.value.length)).toBe(299_000);
    // Deleting is always allowed, and clears the message.
    await noteText(page).fill("short now");
    await expect(page.getByTestId("note-too-big")).toBeHidden();
});

test("space notes: the owner starts them, members edit them; members can't start them", async ({ page, browser }) => {
    const owner = await registerUser("owner");
    const member = await registerUser("member");
    await createSpaceWithChannel(owner, member, { space: "Notes Hall", channel: "general" });

    // A member sees Notes but can't start them.
    const memberPage = await (await browser.newContext()).newPage();
    await signIn(memberPage, member);
    await memberPage.getByTitle("Notes Hall").click();
    await memberPage.getByTestId("space-notes").click();
    await expect(memberPage.getByTestId("notes-empty")).toContainText("Ask a moderator");

    await signIn(page, owner);
    await page.getByTitle("Notes Hall").click();
    await page.getByTestId("space-notes").click();
    await page.getByTestId("notes-create").click();
    await page.getByTestId("notes-new-note").click();
    await page.getByRole("textbox", { name: "Note title" }).first().fill("Raid plan");
    await page.getByRole("textbox", { name: "Note title" }).first().press("Enter");
    await noteText(page).fill("Meet at the gate.");

    // The member reopens Notes, joins and edits.
    await memberPage.getByTestId("notes-close").click();
    await memberPage.getByTestId("space-notes").click();
    await memberPage.getByTestId("notes-note").filter({ hasText: "Raid plan" }).click({ timeout: 30_000 });
    await expect(noteText(memberPage)).toHaveValue("Meet at the gate.", { timeout: 30_000 });
    await noteText(memberPage).click();
    await memberPage.keyboard.press("Control+End");
    await memberPage.keyboard.type(" Bring torches.");
    await expect(noteText(page)).toHaveValue("Meet at the gate. Bring torches.", { timeout: 30_000 });

    // Clicking a channel leaves the notes for the chat.
    await page.locator(".room-item").filter({ hasText: "general" }).locator(".room-item-select").click();
    await expect(page.getByTestId("notes-view")).toBeHidden();
});

test("switching between notes shows one title, the right one (titles used to pile up)", async ({ page }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await encryptedDm(alice, bob);
    await signIn(page, alice);
    await openDmNotes(page);
    await page.getByTestId("notes-create").click();
    for (const title of ["First", "Second", "Third"]) {
        await page.getByTestId("notes-new-note").click();
        await page.getByLabel("Note title").first().fill(title);
        await page.getByLabel("Note title").first().press("Enter");
        await noteText(page).fill(`${title} text`);
    }
    for (const title of ["First", "Third", "Second", "First", "Third"]) {
        await page.getByTestId("notes-note").filter({ hasText: title }).click();
        await expect(page.getByTestId("note-title")).toHaveCount(1);
        await expect(page.getByTestId("note-title")).toHaveValue(title);
        await expect(noteText(page)).toHaveCount(1);
        await expect(noteText(page)).toHaveValue(`${title} text`);
    }
});
