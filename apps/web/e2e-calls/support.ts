// SPDX-License-Identifier: AGPL-3.0-only
// Helpers for real-call tests: voice turned on and pointed at the test token service, and a voice channel to meet in.
import type { Browser, Page } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendState, setDisplayName, type ApiUser } from "../e2e/support/matrixApi";
import { signIn } from "../e2e/support/ui";

export async function enableCalls(page: Page): Promise<void> {
    await page.route("**/config.127.0.0.1.json*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...(await response.json()), voice_enabled: true, livekit_service_url: "http://127.0.0.1:7890" } });
    });
}

export interface VoiceHall {
    spaceId: string;
    voiceId: string;
    users: ApiUser[];
}

// A server with a voice channel, owned by the first user, everyone joined.
export async function voiceHall(names: string[]): Promise<VoiceHall> {
    const users = await Promise.all(names.map((name) => registerUser(name.toLowerCase())));
    await Promise.all(users.map((user, index) => setDisplayName(user, names[index]!)));
    const [owner, ...rest] = users;
    const spaceId = await createRoom(owner!, { name: "Call Hall", preset: "private_chat", creation_content: { type: "m.space" }, invite: rest.map((user) => user.userId) });
    const voiceId = await createRoom(owner!, {
        name: "Voice",
        preset: "private_chat",
        invite: rest.map((user) => user.userId),
        initial_state: [
            { type: "m.space.parent", state_key: spaceId, content: { canonical: true, via: ["localhost"] } },
            { type: "org.heorot.voice_channel", state_key: "", content: { enabled: true, version: 1 } },
        ],
        // Everyone may join calls (as Meadhall sets up voice channels).
        power_level_content_override: { events: { "org.matrix.msc3401.call.member": 0, "org.matrix.msc3401.call": 0 } },
    });
    await sendState(owner!, spaceId, "m.space.child", voiceId, { via: ["localhost"], suggested: true, "org.heorot.channel_type": "voice", "org.heorot.voice_channel": true });
    for (const user of rest) {
        await joinRoom(user, spaceId);
        await joinRoom(user, voiceId);
    }
    return { spaceId, voiceId, users };
}

export async function joinCall(browser: Browser, user: ApiUser): Promise<Page> {
    const page = await (await browser.newContext()).newPage();
    await enableCalls(page);
    await signIn(page, user);
    await page.getByTitle("Call Hall").click();
    await page.locator(".room-item").filter({ hasText: "Voice" }).locator(".room-item-select").click();
    return page;
}
