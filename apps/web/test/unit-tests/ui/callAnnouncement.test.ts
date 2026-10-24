// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { callAnnouncement } from "../../../src/ui/voice/callAnnouncement";

describe("call announcements", () => {
    it("rings one-to-one DMs and notifies group chats", () => {
        expect(callAnnouncement({ isVoiceChannel: false, isHomeRoom: true, isOneToOne: true })).toBe("ring");
        expect(callAnnouncement({ isVoiceChannel: false, isHomeRoom: true, isOneToOne: false })).toBe("notification");
    });

    it("never announces calls in a server's channels, voice or text", () => {
        expect(callAnnouncement({ isVoiceChannel: true, isHomeRoom: false, isOneToOne: false })).toBeNull();
        expect(callAnnouncement({ isVoiceChannel: false, isHomeRoom: false, isOneToOne: false })).toBeNull();
        // Even a channel with only two members isn't a DM.
        expect(callAnnouncement({ isVoiceChannel: false, isHomeRoom: false, isOneToOne: true })).toBeNull();
        expect(callAnnouncement(null)).toBeNull();
    });
});
