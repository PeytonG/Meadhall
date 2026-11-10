// SPDX-License-Identifier: AGPL-3.0-only
// What the game overlay (desktop, Shift+`) shows: a snapshot the main window publishes, and the clicks it sends back.
// See apps/desktop/electron/overlay.ts.

export interface OverlayParticipant {
    userId: string;
    name: string;
    speaking: boolean;
    sharing: boolean;
    // Your volume for them (percent); absent for yourself.
    volume?: number;
}

// A picture in a message: `thumb` in the chat, `full` when opened (web addresses, or a decrypted JPEG from an
// encrypted room as a data: address; see overlayImages.ts).
export interface OverlayImage {
    thumb: string;
    full: string;
    width?: number;
    height?: number;
}

export interface OverlayMessage {
    id: string;
    sender: string;
    body: string;
    room: string;
    image?: OverlayImage;
}

// A conversation you can read and write to from the overlay (the call's chat, recent DMs and channels).
export interface OverlayChat {
    roomId: string;
    name: string;
    messages: OverlayMessage[];
}

export interface OverlaySound {
    key: string; // "builtin:<id>" or "custom:<id>"
    name: string;
    emoji: string;
}

export interface OverlayState {
    inCall: boolean;
    channel: string | null;
    micMuted: boolean;
    deafened: boolean;
    cameraOn: boolean;
    sharing: boolean;
    participants: OverlayParticipant[];
    // Recent mentions and DMs from others, newest last.
    notifications: OverlayMessage[];
    chats: OverlayChat[];
    sounds: OverlaySound[];
}

export type OverlayCommand =
    | { type: "toggleMute" | "toggleDeafen" | "toggleCamera" | "toggleScreenShare" | "openSoundboard" | "leave" | "openApp" }
    | { type: "playSound"; key: string }
    | { type: "setVolume"; userId: string; percent: number }
    | { type: "sendMessage"; roomId: string; body: string }
    | { type: "openRoom"; roomId: string };

export const EMPTY_OVERLAY_STATE: OverlayState = {
    inCall: false,
    channel: null,
    micMuted: false,
    deafened: false,
    cameraOn: false,
    sharing: false,
    participants: [],
    notifications: [],
    chats: [],
    sounds: [],
};

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const objects = (value: unknown, max: number): Array<Record<string, unknown>> =>
    Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").slice(0, max) : [];
// Only web addresses and image data (never javascript: or other schemes); decrypted previews are at most ~2 MB.
const imageSource = (value: unknown): string | null =>
    typeof value === "string" && value.length <= 2_000_000 && (/^https?:\/\//i.test(value) || /^data:image\/(jpeg|png|gif|webp);base64,/i.test(value)) ? value : null;
const size = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(value, 100_000) : undefined);
const image = (value: unknown): OverlayImage | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    const thumb = imageSource(record.thumb);
    const full = imageSource(record.full);
    return thumb && full ? { thumb, full, width: size(record.width), height: size(record.height) } : undefined;
};
const message = (item: Record<string, unknown>): OverlayMessage => {
    const picture = image(item.image);
    return { id: text(item.id, 255), sender: text(item.sender, 80), body: text(item.body, 500), room: text(item.room, 80), ...(picture ? { image: picture } : {}) };
};

// The overlay page reads what the main window sent, defensively.
export function parseOverlayState(value: unknown): OverlayState {
    if (!value || typeof value !== "object") return EMPTY_OVERLAY_STATE;
    const state = value as Record<string, unknown>;
    return {
        inCall: state.inCall === true,
        channel: typeof state.channel === "string" ? state.channel.slice(0, 120) : null,
        micMuted: state.micMuted === true,
        deafened: state.deafened === true,
        cameraOn: state.cameraOn === true,
        sharing: state.sharing === true,
        participants: objects(state.participants, 50).map((item) => ({
            userId: text(item.userId, 255),
            name: text(item.name, 80),
            speaking: item.speaking === true,
            sharing: item.sharing === true,
            ...(typeof item.volume === "number" && Number.isFinite(item.volume) ? { volume: Math.max(0, Math.min(200, item.volume)) } : {}),
        })),
        notifications: objects(state.notifications, 20).map(message),
        chats: objects(state.chats, 12).map((item) => ({
            roomId: text(item.roomId, 255),
            name: text(item.name, 80),
            messages: objects(item.messages, 30).map(message),
        })),
        sounds: objects(state.sounds, 150).map((item) => ({ key: text(item.key, 120), name: text(item.name, 60), emoji: text(item.emoji, 16) })),
    };
}

// Older overlays sent bare strings ("toggleMute").
export function parseOverlayCommand(value: unknown): OverlayCommand | null {
    const command = typeof value === "string" ? { type: value } : value;
    if (!command || typeof command !== "object") return null;
    const record = command as Record<string, unknown>;
    switch (record.type) {
        case "toggleMute":
        case "toggleDeafen":
        case "toggleCamera":
        case "toggleScreenShare":
        case "openSoundboard":
        case "leave":
        case "openApp":
            return { type: record.type };
        case "playSound":
            return typeof record.key === "string" ? { type: "playSound", key: record.key.slice(0, 120) } : null;
        case "setVolume":
            return typeof record.userId === "string" && typeof record.percent === "number" && Number.isFinite(record.percent)
                ? { type: "setVolume", userId: record.userId, percent: Math.max(0, Math.min(200, record.percent)) }
                : null;
        case "sendMessage":
            return typeof record.roomId === "string" && typeof record.body === "string" && record.body.trim()
                ? { type: "sendMessage", roomId: record.roomId, body: record.body.slice(0, 4000) }
                : null;
        case "openRoom":
            return typeof record.roomId === "string" ? { type: "openRoom", roomId: record.roomId } : null;
        default:
            return null;
    }
}
