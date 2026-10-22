import { EventType, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

export const HEOROT_VOICE_CHANNEL_EVENT = "org.heorot.voice_channel";
export const MATRIX_CALL_COMPAT_EVENT = "org.matrix.msc3401.call";
export const HEOROT_SPACE_CHILD_CHANNEL_TYPE_KEY = "org.heorot.channel_type";
export const HEOROT_SPACE_CHILD_VOICE_KEY = "org.heorot.voice_channel";
// Minimum power level a channel was set up for (written by the Discord import).
export const CHANNEL_ACCESS_EVENT = "com.heorot.channel_access";
// MatrixRTC call memberships: state events of this type, as Element Call sends them in its default mode.
export const MATRIX_RTC_MEMBER_EVENT = "org.matrix.msc3401.call.member";

type InitialStateEvent = { type: string; state_key: string; content: Record<string, unknown> };

// State that makes a new room a voice channel; shared by the create dialog and the Discord import.
export function voiceChannelInitialState(): InitialStateEvent[] {
    return [
        {
            type: HEOROT_VOICE_CHANNEL_EVENT,
            state_key: "",
            content: { enabled: true, version: 1, chat_suppressed: true },
        },
        {
            type: MATRIX_CALL_COMPAT_EVENT,
            state_key: "",
            content: { type: "voice", intent: "voice", chat_suppressed: true },
        },
    ];
}

// Call memberships are state events, which members can't send at the default state_default of 50, so a voice
// channel must lower them to the level allowed in the channel (Element Web does the same for its calls).
// This edits the room's actual power levels: a createRoom override would replace the server's default `events`
// map, whose values differ between room versions.
export async function allowCallMemberships(client: MatrixClient, roomId: string, minPowerLevel: number): Promise<void> {
    const powerLevels = (await client.getStateEvent(roomId, EventType.RoomPowerLevels, "")) as Record<string, unknown>;
    const events = isObject(powerLevels.events) ? powerLevels.events : {};
    await client.sendStateEvent(
        roomId,
        EventType.RoomPowerLevels,
        { ...powerLevels, events: { ...events, [MATRIX_RTC_MEMBER_EVENT]: minPowerLevel } } as never,
        "",
    );
}

export function canJoinCalls(room: Room, userId: string): boolean {
    return room.currentState.maySendStateEvent(MATRIX_RTC_MEMBER_EVENT, userId);
}

function readNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// The power level members of this channel are meant to join calls at: the channel's access level if it was set up
// with one, otherwise the room's default user level.
function intendedCallPowerLevel(room: Room): number {
    const powerLevels = room.currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent() ?? {};
    const access = room.currentState.getStateEvents(CHANNEL_ACCESS_EVENT, "")?.getContent() ?? {};
    return readNumber(access.min_power_level) ?? readNumber(powerLevels.users_default) ?? 0;
}

// False for voice channels created before call memberships were allowed (e.g. by Heorot): members could connect
// to the media server but not announce themselves to the call, so Element users would not see or decrypt them.
export function canMembersJoinCalls(room: Room): boolean {
    const powerLevels = room.currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent() ?? {};
    const events = isObject(powerLevels.events) ? powerLevels.events : {};
    const required = readNumber(events[MATRIX_RTC_MEMBER_EVENT]) ?? readNumber(powerLevels.state_default) ?? 50;
    return required <= intendedCallPowerLevel(room);
}

export async function allowMembersToJoinCalls(client: MatrixClient, room: Room): Promise<void> {
    await allowCallMemberships(client, room.roomId, intendedCallPowerLevel(room));
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isVoiceLabel(value: unknown): boolean {
    return typeof value === "string" && value.trim().toLowerCase() === "voice";
}

export function isVoiceChannelHintContent(content: unknown): boolean {
    if (!isObject(content)) {
        return false;
    }

    if (content[HEOROT_SPACE_CHILD_VOICE_KEY] === true) {
        return true;
    }

    if (isVoiceLabel(content[HEOROT_SPACE_CHILD_CHANNEL_TYPE_KEY])) {
        return true;
    }

    // Legacy/fallback generic key support.
    return isVoiceLabel(content.channel_type);
}

export function isVoiceChannelRoom(room: Room | null): boolean {
    if (!room) {
        return false;
    }

    const heorotEvent = room.currentState.getStateEvents(HEOROT_VOICE_CHANNEL_EVENT, "");
    const heorotContent = heorotEvent?.getContent();
    if (isObject(heorotContent) && heorotContent.enabled === true) {
        return true;
    }

    // MSC3401-style compatibility fallback.
    const callEvent = room.currentState.getStateEvents(MATRIX_CALL_COMPAT_EVENT, "");
    const callContent = callEvent?.getContent();
    if (!isObject(callContent)) {
        return false;
    }

    const intent = typeof callContent.intent === "string" ? callContent.intent.toLowerCase() : "";
    const callType = typeof callContent.type === "string" ? callContent.type.toLowerCase() : "";
    return intent === "voice" || callType === "voice";
}
