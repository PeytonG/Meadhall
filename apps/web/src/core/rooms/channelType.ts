// SPDX-License-Identifier: AGPL-3.0-only
// Channel types like Discord's: text (#), rules, FAQ, news and events, each with its own icon. (Voice channels are
// marked separately, by core/voice/voiceChannel.ts.) The type is a state event in the channel, and is copied into the
// server's m.space.child entry so people see the right icon before joining. Rules and news channels start out with
// only moderators posting (everyone can still react).
import { EventType, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import { HEOROT_SPACE_CHILD_CHANNEL_TYPE_KEY } from "../voice/voiceChannel";

export const CHANNEL_TYPE_EVENT = "io.github.peytong.meadhall.channel_type";

export type ChannelType = "text" | "rules" | "faq" | "news" | "events";

export const CHANNEL_TYPES: ReadonlyArray<{ type: ChannelType; label: string; description: string }> = [
    { type: "text", label: "Text", description: "Messages, pictures, GIFs and links." },
    { type: "rules", label: "Rules", description: "The server's rules. Only moderators post." },
    { type: "faq", label: "FAQ", description: "Answers to common questions." },
    { type: "news", label: "News", description: "Announcements. Only moderators post; everyone can react." },
    { type: "events", label: "Events", description: "What's coming up." },
];

const TYPES = new Set<string>(CHANNEL_TYPES.map((entry) => entry.type));

export function parseChannelType(value: unknown): ChannelType | null {
    return typeof value === "string" && TYPES.has(value) ? (value as ChannelType) : null;
}

// From the channel's own state, else the server's listing of it.
export function getChannelType(room: Room, space?: Room | null): ChannelType {
    const own = parseChannelType(room.currentState.getStateEvents(CHANNEL_TYPE_EVENT, "")?.getContent()?.type);
    if (own) return own;
    const listed = space?.currentState.getStateEvents(EventType.SpaceChild, room.roomId)?.getContent()?.[HEOROT_SPACE_CHILD_CHANNEL_TYPE_KEY];
    return parseChannelType(listed) ?? "text";
}

export function channelTypeInitialState(type: ChannelType): Array<{ type: string; state_key: string; content: Record<string, unknown> }> {
    return type === "text" ? [] : [{ type: CHANNEL_TYPE_EVENT, state_key: "", content: { type } }];
}

export function postsLimitedToModerators(type: ChannelType): boolean {
    return type === "rules" || type === "news";
}

// Only moderators (level 50) may post; reactions stay open to everyone.
export async function limitPostsToModerators(client: MatrixClient, roomId: string): Promise<void> {
    const current = (client.getRoom(roomId)?.currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent() ??
        (await client.getStateEvent(roomId, EventType.RoomPowerLevels, ""))) as Record<string, unknown>;
    const events = { ...((current.events as Record<string, number> | undefined) ?? {}), "m.reaction": 0 };
    await client.sendStateEvent(roomId, EventType.RoomPowerLevels, { ...current, events_default: 50, events } as never, "");
}

export async function setChannelType(client: MatrixClient, room: Room, space: Room | null, type: ChannelType): Promise<void> {
    await client.sendStateEvent(room.roomId, CHANNEL_TYPE_EVENT as never, { type } as never, "");
    if (!space) return;
    const child = space.currentState.getStateEvents(EventType.SpaceChild, room.roomId)?.getContent();
    if (child && child[HEOROT_SPACE_CHILD_CHANNEL_TYPE_KEY] !== "voice") {
        const next = { ...child, [HEOROT_SPACE_CHILD_CHANNEL_TYPE_KEY]: type };
        // Updating the listing needs permission in the server; the channel's own type is what counts.
        await client.sendStateEvent(space.roomId, EventType.SpaceChild, next as never, room.roomId).catch(() => undefined);
    }
}

// A channel you haven't joined yet: its type from the server's listing.
export function listedChannelType(space: Room | null | undefined, roomId: string): ChannelType {
    return parseChannelType(space?.currentState.getStateEvents(EventType.SpaceChild, roomId)?.getContent()?.[HEOROT_SPACE_CHILD_CHANNEL_TYPE_KEY]) ?? "text";
}
