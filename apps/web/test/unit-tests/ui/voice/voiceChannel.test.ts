import { describe, expect, it } from "vitest";

import {
    HEOROT_VOICE_CHANNEL_EVENT,
    MATRIX_CALL_COMPAT_EVENT,
    canMembersJoinCalls,
    isVoiceChannelRoom,
} from "../../../../src/ui/voice/voiceChannel";

interface MockStateEvent {
    getContent: () => unknown;
}

function makeStateEvent(content: unknown): MockStateEvent {
    return {
        getContent: () => content,
    };
}

function makeRoom(options: { heorotContent?: unknown; callContent?: unknown } = {}): {
    currentState: {
        getStateEvents: (eventType: string, stateKey: string) => MockStateEvent | null;
    };
} {
    return {
        currentState: {
            getStateEvents: (eventType: string): MockStateEvent | null => {
                if (eventType === HEOROT_VOICE_CHANNEL_EVENT) {
                    return options.heorotContent === undefined ? null : makeStateEvent(options.heorotContent);
                }

                if (eventType === MATRIX_CALL_COMPAT_EVENT) {
                    return options.callContent === undefined ? null : makeStateEvent(options.callContent);
                }

                return null;
            },
        },
    };
}

describe("isVoiceChannelRoom", () => {
    it("returns false for null room", () => {
        expect(isVoiceChannelRoom(null)).toBe(false);
    });

    it("returns true for Heorot voice state event", () => {
        const room = makeRoom({
            heorotContent: { enabled: true },
        });

        expect(isVoiceChannelRoom(room as any)).toBe(true);
    });

    it("falls back to matrix call event by intent", () => {
        const room = makeRoom({
            heorotContent: { enabled: false },
            callContent: { intent: "VOICE" },
        });

        expect(isVoiceChannelRoom(room as any)).toBe(true);
    });

    it("falls back to matrix call event by type", () => {
        const room = makeRoom({
            callContent: { type: "voice" },
        });

        expect(isVoiceChannelRoom(room as any)).toBe(true);
    });

    it("returns false when events are missing or invalid", () => {
        const room = makeRoom({
            heorotContent: "not-an-object",
            callContent: { intent: "video", type: "video" },
        });

        expect(isVoiceChannelRoom(room as any)).toBe(false);
    });
});

function makeAccessRoom(powerLevels: unknown, channelAccess?: unknown): any {
    return {
        currentState: {
            getStateEvents: (eventType: string) => {
                if (eventType === "m.room.power_levels") return powerLevels === undefined ? null : makeStateEvent(powerLevels);
                if (eventType === "com.heorot.channel_access") return channelAccess === undefined ? null : makeStateEvent(channelAccess);
                return null;
            },
        },
    };
}

describe("canMembersJoinCalls", () => {
    it("is false at the default state level, as in voice channels made before calls were allowed", () => {
        expect(canMembersJoinCalls(makeAccessRoom({ users_default: 0, state_default: 50 }))).toBe(false);
        expect(canMembersJoinCalls(makeAccessRoom(undefined))).toBe(false);
    });

    it("is true once call memberships are lowered to the members' level", () => {
        const powerLevels = { users_default: 0, state_default: 50, events: { "org.matrix.msc3401.call.member": 0 } };
        expect(canMembersJoinCalls(makeAccessRoom(powerLevels))).toBe(true);
    });

    it("measures restricted channels against their access level", () => {
        const restricted = { users_default: 0, events: { "org.matrix.msc3401.call.member": 50 } };
        expect(canMembersJoinCalls(makeAccessRoom(restricted, { min_power_level: 50 }))).toBe(true);
        expect(canMembersJoinCalls(makeAccessRoom(restricted))).toBe(false);
    });
});
