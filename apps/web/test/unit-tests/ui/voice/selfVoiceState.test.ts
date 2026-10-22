// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import {
    DEFAULT_SELF_VOICE_STATE,
    loadSelfVoiceState,
    saveSelfVoiceState,
    toggleSelfDeafen,
    toggleSelfMute,
} from "../../../../src/ui/voice/selfVoiceState";

describe("self mute and deafen", () => {
    it("deafening mutes, and undeafening restores the mic", () => {
        const deafened = toggleSelfDeafen(DEFAULT_SELF_VOICE_STATE);
        expect(deafened).toMatchObject({ muted: true, deafened: true });
        expect(toggleSelfDeafen(deafened)).toMatchObject({ muted: false, deafened: false });
    });

    it("undeafening keeps a mute the user chose before deafening", () => {
        const muted = toggleSelfMute(DEFAULT_SELF_VOICE_STATE);
        const deafened = toggleSelfDeafen(muted);
        expect(toggleSelfDeafen(deafened)).toMatchObject({ muted: true, deafened: false });
    });

    it("unmuting while deafened undeafens too", () => {
        const deafened = toggleSelfDeafen(DEFAULT_SELF_VOICE_STATE);
        expect(toggleSelfMute(deafened)).toMatchObject({ muted: false, deafened: false });
    });

    it("persists across reloads", () => {
        saveSelfVoiceState({ muted: true, deafened: false, mutedByDeafen: false });
        expect(loadSelfVoiceState()).toMatchObject({ muted: true, deafened: false });
    });
});
