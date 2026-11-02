export function buildMatrixToEventPermalink(roomId: string, eventId: string): string {
    return `https://matrix.to/#/${encodeURIComponent(roomId)}/${encodeURIComponent(eventId)}`;
}

export function buildMatrixToRoomPermalink(roomId: string): string {
    return `https://matrix.to/#/${encodeURIComponent(roomId)}`;
}

// Meadhall's own links (meadhall://room/<room>/<event>): the desktop and phone apps open them straight at the
// message, instead of matrix.to's "pick an app" page.
export const MEADHALL_LINK_SCHEME = "meadhall:";

export function buildMeadhallEventLink(roomId: string, eventId: string): string {
    return `meadhall://room/${encodeURIComponent(roomId)}/${encodeURIComponent(eventId)}`;
}

export function buildMeadhallRoomLink(roomId: string): string {
    return `meadhall://room/${encodeURIComponent(roomId)}`;
}

export interface AppLink {
    // A room ID (!...) or alias (#...).
    room: string;
    eventId: string | null;
}

// A room ID ("!opaque:server", or "!opaque" from room version 12 on) or an alias ("#name:server").
const ROOM = /^(![^/\s]+|#[^/\s]+:[^/\s]+)$/;
const EVENT = /^\$[^/\s]+$/;

function decode(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}

function fromParts(parts: string[]): AppLink | null {
    const room = parts[0] ? decode(parts[0]) : null;
    if (!room || !ROOM.test(room)) return null;
    const eventId = parts[1] ? decode(parts[1]) : null;
    return { room, eventId: eventId && EVENT.test(eventId) ? eventId : null };
}

// A room or message link Meadhall can open itself: meadhall://room/..., https://matrix.to/#/... or matrix:roomid/...
// (MSC2312). Links to people or anything else are left to the browser.
export function parseAppLink(href: string): AppLink | null {
    const value = href.trim();
    if (value.toLowerCase().startsWith("meadhall://room/")) {
        return fromParts(value.slice("meadhall://room/".length).split(/[?#]/)[0]!.split("/"));
    }
    const matrixTo = /^https:\/\/matrix\.to\/#\/(.+)$/i.exec(value);
    if (matrixTo) {
        return fromParts(matrixTo[1]!.split("?")[0]!.split("/"));
    }
    const matrixUri = /^matrix:(roomid|r)\/([^/?]+)(?:\/e\/([^/?]+))?/i.exec(value);
    if (matrixUri) {
        const sigil = matrixUri[1]!.toLowerCase() === "roomid" ? "!" : "#";
        return fromParts([encodeURIComponent(sigil + decode(matrixUri[2]!)), ...(matrixUri[3] ? [encodeURIComponent("$" + decode(matrixUri[3]))] : [])]);
    }
    return null;
}
