// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { NOTIFICATION_TONES, soundFor } from "../../../src/ui/notifications/notificationTones";
import { DEFAULT_USER_SETTINGS } from "../../../src/ui/settings/user/settingsStore";

const base = DEFAULT_USER_SETTINGS.notifications;

describe("notification sounds", () => {
    it("plays the message tone for everything by default", () => {
        expect(soundFor(base, "message")).toEqual({ file: null, tone: "chime" });
        expect(soundFor(base, "mention")).toEqual({ file: null, tone: "chime" });
        expect(soundFor(base, "direct")).toEqual({ file: null, tone: "chime" });
    });

    it("lets mentions and DMs have their own tone or file", () => {
        const settings = { ...base, messageTone: "blip", mentionTone: "coin", dmTone: "custom", dmSoundDataUrl: "data:audio/ogg;base64,AA==" };
        expect(soundFor(settings, "message").tone).toBe("blip");
        expect(soundFor(settings, "mention").tone).toBe("coin");
        expect(soundFor(settings, "direct").file).toBe("data:audio/ogg;base64,AA==");
    });

    it("falls back to a tone when a chosen file is missing", () => {
        expect(soundFor({ ...base, messageTone: "custom", customMessageSoundDataUrl: null }, "message")).toEqual({ file: null, tone: "chime" });
    });

    it("has unique tone ids", () => {
        expect(new Set(NOTIFICATION_TONES.map((tone) => tone.id)).size).toBe(NOTIFICATION_TONES.length);
    });
});
