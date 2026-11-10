// SPDX-License-Identifier: AGPL-3.0-only
// Calls between homeservers whose call servers only let their own users talk (lk-jwt-service 0.7+): the owner's
// report was "my friend's join tries to connect then stops; it only works if he starts the call". Each person talks
// on their own homeserver's call server and listens on the other's, whoever started the call. Alice's call server is
// A (port 7891), Bob's is B (7892); each has its own rooms and lets only its own user talk.
import { expect, test, type Page } from "@playwright/test";

import { hearsSomeone, joinCall, voiceHall } from "./support";

const A = "http://127.0.0.1:7891";
const B = "http://127.0.0.1:7892";

async function inCallWith(page: Page, count: number): Promise<void> {
    await expect(page.getByTestId("call-participant")).toHaveCount(count, { timeout: 60_000 });
    await expect.poll(() => hearsSomeone(page), { timeout: 60_000 }).toBe(true);
}

for (const first of ["Alice", "Bob"] as const) {
    test(`${first} starts the call and the person from the other homeserver joins: both talk and hear each other`, async ({ browser }) => {
        const hall = await voiceHall(["Alice", "Bob"]);
        const [alice, bob] = hall.users;
        const starter = first === "Alice" ? { user: alice!, server: A } : { user: bob!, server: B };
        const joiner = first === "Alice" ? { user: bob!, server: B } : { user: alice!, server: A };

        const starterPage = await joinCall(browser, starter.user, starter.server);
        await expect(starterPage.getByTestId("voice-pill")).toContainText("Voice Connected", { timeout: 60_000 });
        const joinerPage = await joinCall(browser, joiner.user, joiner.server);
        await expect(joinerPage.getByTestId("voice-pill")).toContainText("Voice Connected", { timeout: 60_000 });

        // Both see both, and hear the other's microphone (it comes over the other call server).
        await inCallWith(starterPage, 2);
        await inCallWith(joinerPage, 2);
        // The joiner stayed (it used to drop right after connecting).
        await joinerPage.waitForTimeout(5_000);
        await expect(joinerPage.getByTestId("voice-pill")).toContainText("Voice Connected");
        await expect(joinerPage.getByTestId("call-participant")).toHaveCount(2);
    });
}

test("someone whose homeserver has no call server can still join and listen, and is told why they can't talk", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Carol"]);
    const [alice, carol] = hall.users;
    const alicePage = await joinCall(browser, alice!, A);
    await expect(alicePage.getByTestId("voice-pill")).toContainText("Voice Connected", { timeout: 60_000 });

    const carolPage = await joinCall(browser, carol!, null);
    await expect(carolPage.getByTestId("voice-pill")).toContainText("Voice Connected", { timeout: 60_000 });
    await expect.poll(() => hearsSomeone(carolPage), { timeout: 60_000 }).toBe(true);
    await expect(carolPage.getByText(/You can listen, but not talk/)).toBeVisible();
    await carolPage.waitForTimeout(5_000);
    await expect(carolPage.getByTestId("voice-pill")).toContainText("Voice Connected");
});
