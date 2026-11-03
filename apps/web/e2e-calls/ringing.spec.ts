// SPDX-License-Identifier: AGPL-3.0-only
// Ringing in a DM call, like Discord: the caller sees the other person as "Ringing…" while their phone rings; when they
// decline, the caller sees "Declined". In a group DM everyone is rung.
import { expect, test, type Page } from "@playwright/test";

import { createRoom, joinRoom, registerUser, setAccountData, setDisplayName } from "../e2e/support/matrixApi";
import { signIn } from "../e2e/support/ui";
import { enableCalls } from "./support";

async function openDm(page: Page, name: string): Promise<void> {
    await page.locator(".home-row").filter({ hasText: name }).first().click();
}

test("the caller sees Ringing…, and Declined when the other person declines", async ({ browser }) => {
    const alice = await registerUser("alice");
    const bob = await registerUser("bob");
    await setDisplayName(alice, "Alice");
    await setDisplayName(bob, "Bob");
    const dm = await createRoom(alice, { is_direct: true, preset: "trusted_private_chat", invite: [bob.userId] });
    await joinRoom(bob, dm);
    await setAccountData(alice, "m.direct", { [bob.userId]: [dm] });
    await setAccountData(bob, "m.direct", { [alice.userId]: [dm] });

    const bobPage = await (await browser.newContext()).newPage();
    await enableCalls(bobPage);
    await signIn(bobPage, bob);

    const alicePage = await (await browser.newContext()).newPage();
    await enableCalls(alicePage);
    await signIn(alicePage, alice);
    await openDm(alicePage, "Bob");
    await alicePage.getByTestId("header-call").click();

    const ringing = alicePage.getByTestId("call-ringing");
    await expect(ringing).toContainText("Bob", { timeout: 60_000 });
    await expect(ringing).toContainText("Ringing…");

    const card = bobPage.getByTestId("incoming-call");
    await expect(card).toContainText("Alice", { timeout: 30_000 });
    await card.getByRole("button", { name: "Decline call" }).click();
    await expect(ringing).toContainText("Declined", { timeout: 30_000 });
});
