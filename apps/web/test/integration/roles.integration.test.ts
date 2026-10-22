// SPDX-License-Identifier: AGPL-3.0-only
// Roles are enforced by the server: they become power levels and invite-only channels.
import { EventType, Preset, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { describe, expect, it } from "vitest";

import { saveRoles, setChannelViewRoles, setMemberRoles } from "../../src/core/roles/applyRoles";
import type { Role } from "../../src/core/roles/roles";
import { registerUser, startClient, waitFor } from "./support/synapse";

function room(client: MatrixClient, roomId: string): Room {
    const found = client.getRoom(roomId);
    if (!found) throw new Error(`${client.getUserId()} has no room ${roomId}`);
    return found;
}

function levelOf(client: MatrixClient, roomId: string, userId: string): number {
    const content = room(client, roomId).currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent() as { users?: Record<string, number> };
    return content.users?.[userId] ?? 0;
}

describe("roles against Synapse", () => {
    it("turn into power levels and private channels that the server enforces", async () => {
        const [ownerUser, bobUser, carolUser, daveUser] = await Promise.all(["owner", "bob", "carol", "dave"].map((name) => registerUser(name)));
        const owner = await startClient(ownerUser, { crypto: false });
        const bob = await startClient(bobUser, { crypto: false });
        const carol = await startClient(carolUser, { crypto: false });
        const guests = [bobUser, carolUser, daveUser].map((user) => user.userId);

        const { room_id: spaceId } = await owner.createRoom({ name: "Hall", preset: Preset.PrivateChat, creation_content: { type: "m.space" }, invite: guests });
        const { room_id: channelId } = await owner.createRoom({
            name: "war-room",
            preset: Preset.PrivateChat,
            invite: guests,
            initial_state: [{ type: EventType.SpaceParent, state_key: spaceId, content: { canonical: true, via: ["localhost"] } }],
        });
        await owner.sendStateEvent(spaceId, EventType.SpaceChild, { via: ["localhost"] } as never, channelId);
        for (const client of [bob, carol]) {
            await waitFor(() => client.getRoom(spaceId) && client.getRoom(channelId), "invites");
            await client.joinRoom(spaceId);
            await client.joinRoom(channelId);
        }
        await waitFor(() => room(owner, channelId).getJoinedMemberCount() === 3 || undefined, "everyone in the channel");

        const space = room(owner, spaceId);
        const channel = room(owner, channelId);
        const roles: Role[] = [
            { id: "mod", name: "Moderator", color: "#ff7a1a", rank: 50, permissions: ["kick", "manage_messages"] },
            { id: "member", name: "Member", color: "#2ecc71", rank: 10, permissions: ["invite"] },
        ];
        await saveRoles(owner, space, [channel], roles);
        await setMemberRoles(owner, space, [channel], bobUser.userId, ["mod"]);
        await setMemberRoles(owner, space, [channel], carolUser.userId, ["member"]);

        // Bob's role became his power level in the space and its channel, and kicking needs the Moderator rank.
        await waitFor(() => levelOf(bob, channelId, bobUser.userId) === 50 || undefined, "bob's level in the channel");
        expect(levelOf(owner, spaceId, bobUser.userId)).toBe(50);
        await waitFor(() => levelOf(owner, channelId, carolUser.userId) === 10 || undefined, "carol's level in the channel");
        const channelLevels = room(owner, channelId).currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent();
        expect(channelLevels).toMatchObject({ kick: 50, redact: 50, invite: 10 });

        // The server lets Bob (Moderator) kick, and not Carol (Member).
        await expect(carol.kick(spaceId, daveUser.userId, "test")).rejects.toMatchObject({ httpStatus: 403 });
        await expect(bob.kick(spaceId, daveUser.userId, "test")).resolves.toBeDefined();

        // Make the channel private to Moderators: Carol is removed and can't rejoin; Bob stays.
        await setChannelViewRoles(owner, space, room(owner, channelId), ["mod"]);
        await waitFor(() => room(owner, channelId).getMember(carolUser.userId)?.membership === "leave" || undefined, "carol removed");
        expect(room(owner, channelId).getMember(bobUser.userId)?.membership).toBe("join");
        await expect(carol.joinRoom(channelId)).rejects.toMatchObject({ httpStatus: 403 });

        // Giving Carol the Moderator role invites her back.
        await setMemberRoles(owner, space, [room(owner, channelId)], carolUser.userId, ["member", "mod"]);
        await waitFor(() => room(owner, channelId).getMember(carolUser.userId)?.membership === "invite" || undefined, "carol invited");
        await expect(carol.joinRoom(channelId)).resolves.toBeDefined();

        for (const client of [owner, bob, carol]) client.stopClient();
    });
});
