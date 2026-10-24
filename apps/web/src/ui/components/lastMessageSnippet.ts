// SPDX-License-Identifier: AGPL-3.0-only
// A short preview of a conversation's latest message, for the Direct Messages list ("You: see you there").
import { EventType, MsgType, RelationType, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

const MAX_LENGTH = 70;

function describe(event: MatrixEvent): string | null {
    const type = event.getType();
    if (type === EventType.Sticker) {
        return "Sent a sticker";
    }
    if (type === EventType.RoomMessageEncrypted) {
        return event.isDecryptionFailure() ? "Encrypted message" : null; // still decrypting: look further back
    }
    if (type !== EventType.RoomMessage || event.isRedacted()) {
        return null;
    }
    const content = event.getContent() as { msgtype?: string; body?: unknown; "m.relates_to"?: { rel_type?: string } };
    if (content["m.relates_to"]?.rel_type === RelationType.Replace) {
        return null; // an edit; the original is the message
    }
    switch (content.msgtype) {
        case MsgType.Image:
            return "Sent an image";
        case MsgType.Video:
            return "Sent a video";
        case MsgType.Audio:
            return "Sent a voice clip";
        case MsgType.File: {
            // A shared sound or style profile (.meadhall).
            const shared = (content as Record<string, unknown>)["io.github.peytong.meadhall.share"] as { kind?: unknown } | undefined;
            return shared?.kind === "sound" ? "Shared a sound" : shared?.kind === "style" ? "Shared a style" : "Sent a file";
        }
        default: {
            const body = typeof content.body === "string" ? content.body : "";
            // Drop a reply's quoted fallback ("> <@user> text") and collapse whitespace.
            const text = body
                .split("\n")
                .filter((line) => !line.startsWith("> "))
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
            return text || null;
        }
    }
}

export function lastMessageSnippet(room: Room, ownUserId: string, options: { showSender: boolean }): string | null {
    const events = room.getLiveTimeline().getEvents();
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        const text = describe(event);
        if (!text) {
            continue;
        }
        const sender = event.getSender();
        const prefix =
            sender === ownUserId ? "You: " : options.showSender ? `${room.getMember(sender ?? "")?.name ?? sender ?? ""}: ` : "";
        const full = `${prefix}${text}`;
        return full.length > MAX_LENGTH ? `${full.slice(0, MAX_LENGTH - 1)}…` : full;
    }
    return null;
}
