// SPDX-License-Identifier: AGPL-3.0-only
// Helpers for real-call tests: voice turned on and pointed at the test token service, and a voice channel to meet in.
import { test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { createRoom, joinRoom, registerUser, sendState, setDisplayName, type ApiUser } from "../e2e/support/matrixApi";
import { signIn } from "../e2e/support/ui";

// `callServer`: this person's homeserver call server (null: their homeserver has none).
export async function enableCalls(page: Page, callServer: string | null = "http://127.0.0.1:7890"): Promise<void> {
    await page.route("**/config.127.0.0.1.json*", async (route) => {
        const response = await route.fetch();
        const config = { ...(await response.json()), voice_enabled: true } as Record<string, unknown>;
        if (callServer) config.livekit_service_url = callServer;
        else delete config.livekit_service_url;
        await route.fulfill({ response, json: config });
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

// Each test's callers leave when it ends: windows left in their calls (fake camera and mic running) piled up over a
// run and starved later tests' joins.
const openContexts: BrowserContext[] = [];
test.afterEach(async () => {
    await Promise.all(openContexts.splice(0).map((context) => context.close().catch(() => undefined)));
});

export async function joinCall(browser: Browser, user: ApiUser, callServer?: string | null): Promise<Page> {
    const context = await browser.newContext();
    openContexts.push(context);
    const page = await context.newPage();
    await enableCalls(page, callServer);
    await signIn(page, user);
    await page.getByTitle("Call Hall").click();
    await page.locator(".room-item").filter({ hasText: "Voice" }).locator(".room-item-select").click();
    return page;
}

// Live audio from someone else, playing in this page (Chromium's fake microphone sends a tone).
export async function hearsSomeone(page: Page): Promise<boolean> {
    return page.evaluate(() =>
        [...document.querySelectorAll<HTMLAudioElement>("audio[data-source='microphone']")].some((element) => {
            const stream = element.srcObject as MediaStream | null;
            return Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live"));
        }),
    );
}
