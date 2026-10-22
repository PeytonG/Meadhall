// SPDX-License-Identifier: AGPL-3.0-only
// The user's own mute/deafen choice, like Discord's: it works outside calls, is used when joining one, and persists.

export interface SelfVoiceState {
    muted: boolean;
    deafened: boolean;
    // Deafening also mutes; this remembers that the mute came from deafening, so undeafening restores the mic.
    mutedByDeafen: boolean;
}

const STORAGE_KEY = "heorot.voice.self_state.v1";

export const DEFAULT_SELF_VOICE_STATE: SelfVoiceState = { muted: false, deafened: false, mutedByDeafen: false };

export function loadSelfVoiceState(): SelfVoiceState {
    try {
        const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SelfVoiceState> | null;
        if (!raw || typeof raw !== "object") {
            return DEFAULT_SELF_VOICE_STATE;
        }
        return { muted: raw.muted === true, deafened: raw.deafened === true, mutedByDeafen: raw.mutedByDeafen === true };
    } catch {
        return DEFAULT_SELF_VOICE_STATE;
    }
}

export function saveSelfVoiceState(state: SelfVoiceState): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Storage unavailable (private mode): the choice lasts for this session only.
    }
}

export function toggleSelfMute(state: SelfVoiceState): SelfVoiceState {
    if (state.muted) {
        // Unmuting while deafened undeafens too, as in Discord.
        return { muted: false, deafened: false, mutedByDeafen: false };
    }
    return { ...state, muted: true, mutedByDeafen: false };
}

export function toggleSelfDeafen(state: SelfVoiceState): SelfVoiceState {
    if (state.deafened) {
        return state.mutedByDeafen
            ? { muted: false, deafened: false, mutedByDeafen: false }
            : { ...state, deafened: false };
    }
    return { muted: true, deafened: true, mutedByDeafen: !state.muted };
}
