import { EventType, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { describe, expect, it } from "vitest";

import { getSpacePack } from "../../src/core/emoji/EmojiPackStore";
import { runJsonImport, type JsonExport } from "../../src/core/import/importJsonFlow";
import { readCategories, readChannelOrder } from "../../src/core/stores/CategoryStore";
import {
    HEOROT_SPACE_CHILD_CHANNEL_TYPE_KEY,
    HEOROT_SPACE_CHILD_VOICE_KEY,
    MATRIX_RTC_MEMBER_EVENT,
    canMembersJoinCalls,
    isVoiceChannelRoom,
} from "../../src/core/voice/voiceChannel";
import { registerUser, startClient, waitFor } from "./support/synapse";

// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
);

const EXPORT: JsonExport = {
    exported_at: "2026-10-22T00:00:00.000Z",
    guild: { id: "guild-1", name: "Integration Guild" },
    categories: [
        { id: "cat-voice", name: "Voice Channels", position: 1 },
        { id: "cat-text", name: "Text Channels", position: 0 },
    ],
    channels: [
        { id: "ch-random", name: "random", type: "text", position: 1, category_id: "cat-text" },
        { id: "ch-general", name: "general", type: "text", position: 0, category_id: "cat-text", topic: "Say hi" },
        { id: "ch-lounge", name: "Lounge", type: "voice", position: 0, category_id: "cat-voice" },
        { id: "ch-stage", name: "stage", type: "stage", position: 1, category_id: "cat-voice" },
    ],
    emojis: [{ id: "e1", name: "party", shortcode: "party", animated: false, path: "emojis/party.png", status: "ok" }],
};

function roomsByName(client: MatrixClient, spaceId: string): Map<string, Room> | undefined {
    const space = client.getRoom(spaceId);
    if (!space) return undefined;
    const childIds = space.currentState.getStateEvents(EventType.SpaceChild).map((event) => event.getStateKey()!);
    const rooms = childIds.map((id) => client.getRoom(id));
    if (childIds.length !== 3 || rooms.some((room) => !room?.name || room.name.startsWith("Empty"))) return undefined;
    return new Map(rooms.map((room) => [room!.name, room!]));
}

describe("Discord export import against Synapse", () => {
    it("creates the space, channels, categories, order and emoji pack", async () => {
        const client = await startClient(await registerUser("importer"));
        const emojiFiles = new Map([["party.png", new File([PNG_BYTES], "party.png", { type: "image/png" })]]);

        const result = await runJsonImport(client, EXPORT, emojiFiles, () => undefined, { cancelled: false });

        expect(result.errors).toEqual([]);
        expect(result.channelsCreated).toBe(3);
        expect(result.emojisUploaded).toBe(1);

        const rooms = await waitFor(() => roomsByName(client, result.spaceId), "imported channels to sync");
        const space = client.getRoom(result.spaceId)!;
        const general = rooms.get("general")!;
        const random = rooms.get("random")!;
        const lounge = rooms.get("Lounge")!;

        expect(space.isSpaceRoom()).toBe(true);
        expect(space.getJoinRule()).toBe("invite");
        expect(rooms.has("stage")).toBe(false);

        expect(isVoiceChannelRoom(lounge)).toBe(true);
        expect(isVoiceChannelRoom(general)).toBe(false);
        await waitFor(() => canMembersJoinCalls(lounge), "members to be allowed to join calls in the voice channel");
        expect(lounge.hasEncryptionStateEvent()).toBe(false);
        expect(general.hasEncryptionStateEvent()).toBe(true);
        expect(general.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent().topic).toBe("Say hi");

        const loungeChild = space.currentState.getStateEvents(EventType.SpaceChild, lounge.roomId)!.getContent();
        expect(loungeChild[HEOROT_SPACE_CHILD_CHANNEL_TYPE_KEY]).toBe("voice");
        expect(loungeChild[HEOROT_SPACE_CHILD_VOICE_KEY]).toBe(true);
        expect(lounge.currentState.getStateEvents(EventType.SpaceParent, space.roomId)).toBeTruthy();

        const categories = await waitFor(() => (readCategories(space).length === 2 ? readCategories(space) : undefined), "categories");
        expect(categories.map((category) => [category.name, category.roomIds])).toEqual([
            ["Text Channels", [general.roomId, random.roomId]],
            ["Voice Channels", [lounge.roomId]],
        ]);
        await waitFor(() => readChannelOrder(space).length === 3, "channel order");
        expect(readChannelOrder(space)).toEqual([general.roomId, random.roomId, lounge.roomId]);

        const pack = await waitFor(() => getSpacePack(client, space.roomId), "emoji pack");
        expect(pack.emojis[":party:"]?.url).toMatch(/^mxc:\/\/localhost\//);
    });

    it("keeps the creator an admin of channels with restricted posting", async () => {
        const client = await startClient(await registerUser("restricter"));
        const restricted = { minPL: 50 as const, isPublic: false, isEncrypted: true };
        const result = await runJsonImport(client, EXPORT, new Map(), () => undefined, { cancelled: false }, {
            "ch-general": restricted,
            "ch-lounge": { ...restricted, isEncrypted: false },
        });
        expect(result.errors).toEqual([]);

        const rooms = await waitFor(() => roomsByName(client, result.spaceId), "imported channels to sync");
        for (const name of ["general", "Lounge"]) {
            const room = rooms.get(name)!;
            // 100 on room versions < 12; room creators are unlimited (Infinity) from version 12.
            expect(room.getMember(client.getSafeUserId())?.powerLevel, `creator power in ${name}`).toBeGreaterThanOrEqual(100);
            const powerLevels = room.currentState.getStateEvents(EventType.RoomPowerLevels, "")!.getContent();
            expect(powerLevels.events_default, `events_default in ${name}`).toBe(50);
            expect(powerLevels.events["m.room.power_levels"], `power levels protection in ${name}`).toBe(100);
        }
        const loungeEvents = rooms.get("Lounge")!.currentState.getStateEvents(EventType.RoomPowerLevels, "")!.getContent().events;
        expect(loungeEvents[MATRIX_RTC_MEMBER_EVENT]).toBe(50);
    });

    it("is readable by another member who joins the space", async () => {
        const owner = await startClient(await registerUser("owner"));
        const member = await startClient(await registerUser("member"));
        const result = await runJsonImport(owner, EXPORT, new Map(), () => undefined, { cancelled: false });
        await waitFor(() => roomsByName(owner, result.spaceId), "imported channels to sync");

        await owner.invite(result.spaceId, member.getSafeUserId());
        await waitFor(() => member.getRoom(result.spaceId), "invite to reach the member");
        await member.joinRoom(result.spaceId);

        const space = await waitFor(() => {
            const room = member.getRoom(result.spaceId);
            return room?.getMyMembership() === "join" && readCategories(room).length === 2 ? room : undefined;
        }, "member to see the categories");
        expect(readCategories(space).map((category) => category.name)).toEqual(["Text Channels", "Voice Channels"]);
        expect(readChannelOrder(space)).toHaveLength(3);
    });
});
