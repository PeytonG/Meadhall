import { describe, expect, it } from "vitest";

import {
    applyAppearanceTheme,
    loadUserLocalSettings,
    saveUserLocalSettings,
    type UserLocalSettings,
} from "../../../../src/ui/settings/user/settingsStore";

const STORAGE_KEY = "heorot.user_settings.v1";

function createSettings(partial?: Partial<UserLocalSettings>): UserLocalSettings {
    const base: UserLocalSettings = {
        appearance: {
            theme: "dark",
            compactMode: false,
            showTimestamps: true,
            closeOnWindowCloseMinimize: true,
            chatLineLengthCh: 0,
            showSpaceChannelAvatars: false,
        },
        notifications: {
            notificationsEnabled: false,
            notificationBodyEnabled: true,
            audioNotificationsEnabled: true,
            customMessageSoundDataUrl: null,
            customMessageSoundName: null,
        },
        privacy: {
            showReadReceipts: true,
            allowDmsFromServerMembers: true,
        },
        audio: {
            preferredAudioInputId: "default",
            preferredAudioOutputId: "default",
            micTestLoopbackEnabled: false,
            autoGainControlEnabled: true,
            echoCancellationEnabled: true,
            noiseSuppressionEnabled: true,
            voiceIsolationEnabled: true,
            micProfile: "speech",
        },
    };

    return {
        ...base,
        ...partial,
    };
}

describe("settingsStore", () => {
    it("loadUserLocalSettings returns defaults when nothing is stored", () => {
        window.localStorage.removeItem(STORAGE_KEY);
        const settings = loadUserLocalSettings();

        expect(settings.appearance.theme).toBe("dark");
        expect(settings.appearance.showSpaceChannelAvatars).toBe(false);
        expect(settings.audio.preferredAudioInputId).toBe("default");
        expect(settings.notifications.customMessageSoundDataUrl).toBeNull();
    });

    it("loadUserLocalSettings falls back to defaults on invalid JSON", () => {
        window.localStorage.setItem(STORAGE_KEY, "{invalid json");
        const settings = loadUserLocalSettings();
        expect(settings.appearance.theme).toBe("dark");
    });

    it("loadUserLocalSettings normalizes persisted values", () => {
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                appearance: {
                    theme: "light",
                    compactMode: true,
                    showTimestamps: false,
                    closeOnWindowCloseMinimize: false,
                    chatLineLengthCh: 77,
                    showSpaceChannelAvatars: false,
                },
                notifications: {
                    notificationsEnabled: true,
                    notificationBodyEnabled: false,
                    audioNotificationsEnabled: false,
                    customMessageSoundDataUrl: "data:audio/wav;base64,AAA",
                    customMessageSoundName: "Ping",
                },
                privacy: {
                    showReadReceipts: false,
                    allowDmsFromServerMembers: false,
                },
                audio: {
                    preferredAudioInputId: "mic-1",
                    preferredAudioOutputId: "spk-1",
                    micTestLoopbackEnabled: true,
                    autoGainControlEnabled: false,
                    echoCancellationEnabled: false,
                    noiseSuppressionEnabled: false,
                    voiceIsolationEnabled: false,
                    micProfile: "music",
                },
            }),
        );

        const settings = loadUserLocalSettings();
        expect(settings.appearance.theme).toBe("light");
        expect(settings.appearance.compactMode).toBe(true);
        expect(settings.appearance.chatLineLengthCh).toBe(77);
        expect(settings.appearance.showSpaceChannelAvatars).toBe(false);
        expect(settings.notifications.notificationsEnabled).toBe(true);
        expect(settings.notifications.customMessageSoundDataUrl).toMatch(/^data:/);
        expect(settings.privacy.showReadReceipts).toBe(false);
        expect(settings.audio.preferredAudioInputId).toBe("mic-1");
        expect(settings.audio.micProfile).toBe("music");
    });

    it("saveUserLocalSettings writes JSON into local storage", () => {
        const settings = createSettings({
            appearance: {
                theme: "light",
                compactMode: false,
                showTimestamps: true,
                closeOnWindowCloseMinimize: true,
                chatLineLengthCh: 0,
                showSpaceChannelAvatars: false,
            },
        });

        saveUserLocalSettings(settings);
        const raw = window.localStorage.getItem(STORAGE_KEY);
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw ?? "{}").appearance.theme).toBe("light");
    });

    it("applyAppearanceTheme writes data-theme attribute", () => {
        applyAppearanceTheme({
            theme: "light",
            compactMode: false,
            showTimestamps: true,
            closeOnWindowCloseMinimize: true,
            chatLineLengthCh: 0,
            showSpaceChannelAvatars: true,
        });

        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
});

describe("font setting", () => {
    it("defaults to pixel fonts and rejects unknown values", () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ appearance: { fontStyle: "comic-sans" } }));
        expect(loadUserLocalSettings().appearance.fontStyle).toBe("pixel");

        localStorage.setItem(STORAGE_KEY, JSON.stringify({ appearance: { fontStyle: "mixed" } }));
        expect(loadUserLocalSettings().appearance.fontStyle).toBe("mixed");
    });

    it("applies the font mode to the document", () => {
        applyAppearanceTheme({ ...loadUserLocalSettings().appearance, fontStyle: "system" });
        expect(document.documentElement.getAttribute("data-font")).toBe("system");
    });

    it("keeps a custom font and strips characters that could break the CSS", () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ appearance: { fontStyle: "custom", customFontFamily: 'Comic "Neue"; } body {' } }),
        );
        const { appearance } = loadUserLocalSettings();
        expect(appearance.fontStyle).toBe("custom");
        expect(appearance.customFontFamily).toBe("Comic Neue body");
    });

    it("falls back to the system font when Other has no font chosen", () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ appearance: { fontStyle: "custom", customFontFamily: "" } }));
        expect(loadUserLocalSettings().appearance.fontStyle).toBe("system");
    });

    it("applies a custom font as a CSS variable", () => {
        applyAppearanceTheme({ ...loadUserLocalSettings().appearance, fontStyle: "custom", customFontFamily: "Georgia" });
        expect(document.documentElement.getAttribute("data-font")).toBe("custom");
        expect(document.documentElement.style.getPropertyValue("--font-custom")).toBe('"Georgia", system-ui, sans-serif');

        applyAppearanceTheme({ ...loadUserLocalSettings().appearance, fontStyle: "pixel" });
        expect(document.documentElement.style.getPropertyValue("--font-custom")).toBe("");
    });
});
