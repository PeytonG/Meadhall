// SPDX-License-Identifier: AGPL-3.0-only
// What the game overlay (desktop, Shift+`) shows: a snapshot the main window publishes, and the clicks it sends back.
// See apps/desktop/electron/overlay.ts.

export interface OverlayParticipant {
    userId: string;
    name: string;
    speaking: boolean;
    sharing: boolean;
}

export interface OverlayMessage {
    id: string;
    sender: string;
    body: string;
    room: string;
}

export interface OverlayState {
    inCall: boolean;
    channel: string | null;
    micMuted: boolean;
    deafened: boolean;
    cameraOn: boolean;
    sharing: boolean;
    participants: OverlayParticipant[];
    messages: OverlayMessage[];
}

export type OverlayCommand = "toggleMute" | "toggleDeafen" | "toggleCamera" | "toggleScreenShare" | "openSoundboard" | "leave" | "openApp";

export const EMPTY_OVERLAY_STATE: OverlayState = {
    inCall: false,
    channel: null,
    micMuted: false,
    deafened: false,
    cameraOn: false,
    sharing: false,
    participants: [],
    messages: [],
};

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");

// The overlay page reads what the main window sent, defensively.
export function parseOverlayState(value: unknown): OverlayState {
    if (!value || typeof value !== "object") return EMPTY_OVERLAY_STATE;
    const state = value as Record<string, unknown>;
    const list = (key: string): Array<Record<string, unknown>> =>
        Array.isArray(state[key]) ? (state[key] as unknown[]).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").slice(0, 50) : [];
    return {
        inCall: state.inCall === true,
        channel: typeof state.channel === "string" ? state.channel.slice(0, 120) : null,
        micMuted: state.micMuted === true,
        deafened: state.deafened === true,
        cameraOn: state.cameraOn === true,
        sharing: state.sharing === true,
        participants: list("participants").map((item) => ({
            userId: text(item.userId, 255),
            name: text(item.name, 80),
            speaking: item.speaking === true,
            sharing: item.sharing === true,
        })),
        messages: list("messages").map((item) => ({ id: text(item.id, 255), sender: text(item.sender, 80), body: text(item.body, 300), room: text(item.room, 80) })),
    };
}
