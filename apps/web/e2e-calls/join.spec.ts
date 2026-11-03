// SPDX-License-Identifier: AGPL-3.0-only
// Two people join a voice channel on a real LiveKit server, see each other and receive each other's audio.
import { expect, test } from "@playwright/test";

import { hearsSomeone, joinCall, voiceHall } from "./support";

test("two people join a voice channel, see each other and hear each other", async ({ browser }) => {
    const hall = await voiceHall(["Alice", "Bob"]);
    const alice = await joinCall(browser, hall.users[0]!);
    const bob = await joinCall(browser, hall.users[1]!);
    for (const page of [alice, bob]) {
        await expect(page.getByTestId("call-participant")).toHaveCount(2, { timeout: 60_000 });
        await expect.poll(() => hearsSomeone(page), { timeout: 60_000 }).toBe(true);
    }
});
