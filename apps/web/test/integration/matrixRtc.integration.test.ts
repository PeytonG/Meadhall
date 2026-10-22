import { EventType, Preset, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { MatrixRTCSessionEvent, type LivekitTransportConfig } from "matrix-js-sdk/src/matrixrtc";
import { describe, expect, it } from "vitest";

import { buildRtcIdentityMap, getRtcVoiceParticipants, joinMatrixRtcSession } from "../../src/core/voice/matrixRtc";
import {
    allowCallMemberships,
    allowMembersToJoinCalls,
    canJoinCalls,
    canMembersJoinCalls,
    voiceChannelInitialState,
} from "../../src/core/voice/voiceChannel";
import { registerUser, startClient, waitFor, type TestUser } from "./support/synapse";

const TRANSPORT: LivekitTransportConfig = { type: "livekit", livekit_service_url: "https://rtc.example.org/livekit/jwt" };
const CALL_MEMBER_EVENT = "org.matrix.msc3401.call.member";

interface ReceivedKey {
    index: number;
    rtcBackendIdentity: string;
}

// Alice creates a voice channel the way Meadhall's create dialog does and Bob, an ordinary member, joins it.
async function setUpSharedRoom(options: { encrypted: boolean; crypto: boolean; allowCalls?: boolean }): Promise<{
    alice: MatrixClient;
    bob: MatrixClient;
    aliceUser: TestUser;
    bobUser: TestUser;
    roomId: string;
}> {
    const aliceUser = await registerUser("alice");
    const bobUser = await registerUser("bob");
    const alice = await startClient(aliceUser, { crypto: options.crypto });
    const bob = await startClient(bobUser, { crypto: options.crypto });

    const { room_id: roomId } = await alice.createRoom({
        name: "Voice",
        preset: Preset.PrivateChat,
        invite: [bob.getSafeUserId()],
        initial_state: [
            ...voiceChannelInitialState(),
            ...(options.encrypted
                ? [{ type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }]
                : []),
        ],
    });
    if (options.allowCalls !== false) {
        await allowCallMemberships(alice, roomId, 0);
    }
    await waitFor(() => bob.getRoom(roomId), "bob to get the invite");
    await bob.joinRoom(roomId);
    await waitFor(() => alice.getRoom(roomId)?.getMember(bob.getSafeUserId())?.membership === "join", "bob to join");
    return { alice, bob, aliceUser, bobUser, roomId };
}

function room(client: MatrixClient, roomId: string): Room {
    const found = client.getRoom(roomId);
    if (!found) throw new Error(`${client.getUserId()} has no room ${roomId}`);
    return found;
}

describe("MatrixRTC voice sessions against Synapse", () => {
    it("publishes an Element Call compatible membership that other clients list", async () => {
        const { alice, bob, bobUser, roomId } = await setUpSharedRoom({ encrypted: false, crypto: false });
        const bobIdentity = `${bobUser.userId}:${bobUser.deviceId}`;
        // Bob is an ordinary member: this only works because the voice channel lets members send call memberships.
        expect(canJoinCalls(room(bob, roomId), bobUser.userId)).toBe(true);
        const bobSession = bob.matrixRTC.getRoomSession(room(bob, roomId));

        joinMatrixRtcSession(bob, bobSession, TRANSPORT, roomId, { manageMediaKeys: false });

        const participants = await waitFor(() => {
            const result = getRtcVoiceParticipants(alice, room(alice, roomId));
            return result.count === 1 ? result.participants : undefined;
        }, "alice to see bob in the call");
        expect(participants).toEqual([{ identity: bobUser.userId, matrixUserId: bobUser.userId }]);

        const aliceSession = alice.matrixRTC.getRoomSession(room(alice, roomId));
        expect(buildRtcIdentityMap(aliceSession.memberships).get(bobIdentity)).toBe(bobUser.userId);

        // The raw state event, as Element Call reads it.
        const memberEvent = room(alice, roomId)
            .currentState.getStateEvents(CALL_MEMBER_EVENT)
            .find((event) => event.getSender() === bobUser.userId && Object.keys(event.getContent()).length > 0);
        expect(memberEvent?.getContent()).toMatchObject({
            "application": "m.call",
            "call_id": "",
            "scope": "m.room",
            "device_id": bobUser.deviceId,
            "membershipID": bobIdentity,
            "m.call.intent": "audio",
            "focus_active": { type: "livekit", focus_selection: "multi_sfu" },
            "foci_preferred": [{ ...TRANSPORT, livekit_alias: roomId }],
        });

        await bobSession.leaveRoomSession();
        await waitFor(() => getRtcVoiceParticipants(alice, room(alice, roomId)).count === 0, "bob to leave the call");
    });

    it("lets an admin open an older voice channel to members", async () => {
        const { alice, bob, bobUser, roomId } = await setUpSharedRoom({ encrypted: false, crypto: false, allowCalls: false });
        expect(canJoinCalls(room(bob, roomId), bobUser.userId)).toBe(false);
        expect(canMembersJoinCalls(room(alice, roomId))).toBe(false);

        await allowMembersToJoinCalls(alice, room(alice, roomId));

        await waitFor(() => canJoinCalls(room(bob, roomId), bobUser.userId), "bob to be allowed to join calls");
        expect(canMembersJoinCalls(room(alice, roomId))).toBe(true);
        // Only the call membership level changed; the server's other defaults are kept.
        const events = room(alice, roomId).currentState.getStateEvents(EventType.RoomPowerLevels, "")!.getContent().events;
        expect(events).toMatchObject({ [CALL_MEMBER_EVENT]: 0, "m.room.power_levels": 100, "m.room.encryption": 100 });
    });

    it("exchanges media keys over encrypted to-device messages in encrypted rooms", async () => {
        const { alice, bob, aliceUser, bobUser, roomId } = await setUpSharedRoom({ encrypted: true, crypto: true });
        const aliceSession = alice.matrixRTC.getRoomSession(room(alice, roomId));
        const bobSession = bob.matrixRTC.getRoomSession(room(bob, roomId));
        const keysAtAlice: ReceivedKey[] = [];
        const keysAtBob: ReceivedKey[] = [];
        aliceSession.on(MatrixRTCSessionEvent.EncryptionKeyChanged, (_key, index, _membership, rtcBackendIdentity) =>
            keysAtAlice.push({ index, rtcBackendIdentity }),
        );
        bobSession.on(MatrixRTCSessionEvent.EncryptionKeyChanged, (_key, index, _membership, rtcBackendIdentity) =>
            keysAtBob.push({ index, rtcBackendIdentity }),
        );

        joinMatrixRtcSession(alice, aliceSession, TRANSPORT, roomId, { manageMediaKeys: true });
        joinMatrixRtcSession(bob, bobSession, TRANSPORT, roomId, { manageMediaKeys: true });

        // Each side must key the other under the LiveKit identity /sfu/get assigns: @user:server:DEVICE.
        const bobIdentity = `${bobUser.userId}:${bobUser.deviceId}`;
        const aliceIdentity = `${aliceUser.userId}:${aliceUser.deviceId}`;
        await waitFor(() => keysAtAlice.some((key) => key.rtcBackendIdentity === bobIdentity), "alice to receive bob's key", 60_000);
        await waitFor(() => keysAtBob.some((key) => key.rtcBackendIdentity === aliceIdentity), "bob to receive alice's key", 60_000);

        await Promise.all([aliceSession.leaveRoomSession(), bobSession.leaveRoomSession()]);
    });
});
