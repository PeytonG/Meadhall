// SPDX-License-Identifier: AGPL-3.0-only
// Text chat in a voice channel, like Discord: off by default, turned on in the channel's settings by whoever may change
// them. While you're in the call, the chat shows beside it.
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

export const VOICE_CHAT_EVENT = "io.github.peytong.meadhall.voice_chat";

export function isVoiceChatEnabled(room: Room | null | undefined): boolean {
    return room?.currentState.getStateEvents(VOICE_CHAT_EVENT, "")?.getContent()?.enabled === true;
}

export function canChangeVoiceChat(room: Room, userId: string): boolean {
    return room.currentState.maySendStateEvent(VOICE_CHAT_EVENT, userId);
}

export async function setVoiceChat(client: MatrixClient, roomId: string, enabled: boolean): Promise<void> {
    await client.sendStateEvent(roomId, VOICE_CHAT_EVENT as never, { enabled } as never, "");
}
