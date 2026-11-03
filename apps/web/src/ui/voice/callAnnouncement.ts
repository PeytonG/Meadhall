// SPDX-License-Identifier: AGPL-3.0-only
// How starting a call tells others, like Discord: DMs and group chats ring, and calls in a space's channels (voice or
// text) never announce themselves to everyone who can see the channel.
export type CallAnnouncement = "ring" | "notification" | null;

export function callAnnouncement(room: { isVoiceChannel: boolean; isHomeRoom: boolean; isOneToOne: boolean } | null): CallAnnouncement {
    if (!room || room.isVoiceChannel || !room.isHomeRoom) return null;
    return "ring";
}
