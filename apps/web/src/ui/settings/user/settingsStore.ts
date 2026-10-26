import { normalizeVoiceEffect, type VoiceEffect } from "../../voice/voiceChanger";
import { cssFontStack, sanitizeFontFamily } from "../../theme/systemFonts";
import { DEFAULT_ACCENT_COLOR, accentTokens, normalizeHexColor } from "../../theme/accentColor";
import { setIconStyle, type IconStyle } from "../../theme/iconStyle";

// "contrast": high contrast for people who find the other themes hard to see (pure black, white text, bold outlines).
export type AppTheme = "dark" | "light" | "contrast";
// Pixel fonts everywhere, pixel headings with a readable body font, the system font throughout, or any installed
// font ("custom", family in customFontFamily).
export type FontStyle = "pixel" | "mixed" | "system" | "custom";

export interface AppearanceSettings {
    theme: AppTheme;
    compactMode: boolean;
    showTimestamps: boolean;
    closeOnWindowCloseMinimize: boolean;
    // Theme accent picked with the pixel color wheel.
    accentColor: string;
    fontStyle: FontStyle;
    customFontFamily: string;
    // Standard emoji drawn as pixel art (on by default to match the theme).
    pixelEmoji: boolean;
    // Icons as pixel art (default) or smooth lines.
    iconStyle: IconStyle;
    chatLineLengthCh: number;
    showSpaceChannelAvatars: boolean;
}

export interface NotificationsSettings {
    notificationsEnabled: boolean;
    notificationBodyEnabled: boolean;
    audioNotificationsEnabled: boolean;
    customMessageSoundDataUrl: string | null;
    customMessageSoundName: string | null;
    // Incoming calls: ring at all, and with your own sound instead of the built-in jingle.
    ringtoneEnabled: boolean;
    // The tunes as 8-bit chiptune (default) or smooth bell tones.
    soundStyle: "pixel" | "smooth";
    customRingtoneDataUrl: string | null;
    customRingtoneName: string | null;
}

export interface PrivacySettings {
    showReadReceipts: boolean;
    allowDmsFromServerMembers: boolean;
    // Desktop app: show the game you're playing (from Steam) as "Playing ..." to others.
    shareActivity: boolean;
    // Off: you appear offline to everyone, with no status text, Do Not Disturb or game shown.
    shareStatus: boolean;
}

export interface AudioSettings {
    preferredAudioInputId: string;
    preferredAudioOutputId: string;
    micTestLoopbackEnabled: boolean;
    autoGainControlEnabled: boolean;
    echoCancellationEnabled: boolean;
    noiseSuppressionEnabled: boolean;
    voiceIsolationEnabled: boolean;
    micProfile: "speech" | "music";
    // Voice changer effect applied to the mic before sending (ui/voice/voiceChanger.ts).
    voiceEffect: VoiceEffect;
    // Soundboard volume, 0-100 (what you and the call hear).
    soundboardVolume: number;
    // Other people's soundboard sounds in calls, 0-100 (their voices aren't affected).
    othersSoundboardVolume: number;
}

export interface UserLocalSettings {
    appearance: AppearanceSettings;
    notifications: NotificationsSettings;
    privacy: PrivacySettings;
    audio: AudioSettings;
}

const SETTINGS_STORAGE_KEY = "heorot.user_settings.v1";

const DEFAULT_SETTINGS: UserLocalSettings = {
    appearance: {
        theme: "dark",
        compactMode: false,
        showTimestamps: true,
        closeOnWindowCloseMinimize: true,
        accentColor: DEFAULT_ACCENT_COLOR,
        fontStyle: "pixel",
        customFontFamily: "",
        pixelEmoji: true,
        iconStyle: "pixel",
        chatLineLengthCh: 0,
        showSpaceChannelAvatars: false,
    },
    notifications: {
        // On by default: the desktop and Android apps ask for permission; browsers ask when you turn them on.
        notificationsEnabled: true,
        notificationBodyEnabled: true,
        audioNotificationsEnabled: true,
        customMessageSoundDataUrl: null,
        customMessageSoundName: null,
        ringtoneEnabled: true,
        soundStyle: "pixel",
        customRingtoneDataUrl: null,
        customRingtoneName: null,
    },
    privacy: {
        showReadReceipts: true,
        allowDmsFromServerMembers: true,
        shareActivity: true,
        shareStatus: true,
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
        voiceEffect: "off",
        soundboardVolume: 80,
        othersSoundboardVolume: 100,
    },
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSettings(raw: unknown): UserLocalSettings {
    if (!isRecord(raw)) {
        return { ...DEFAULT_SETTINGS };
    }

    const appearance = isRecord(raw.appearance) ? raw.appearance : {};
    const notifications = isRecord(raw.notifications) ? raw.notifications : {};
    const privacy = isRecord(raw.privacy) ? raw.privacy : {};
    const audio = isRecord(raw.audio) ? raw.audio : {};

    const theme: AppTheme = appearance.theme === "light" || appearance.theme === "contrast" ? appearance.theme : "dark";
    const compactMode = appearance.compactMode === true;
    const showTimestamps = appearance.showTimestamps !== false;
    const closeOnWindowCloseMinimize = appearance.closeOnWindowCloseMinimize !== false;
    const showSpaceChannelAvatars = appearance.showSpaceChannelAvatars === true;
    const accentColor = normalizeHexColor(appearance.accentColor) ?? DEFAULT_ACCENT_COLOR;
    const fontStyle: FontStyle =
        appearance.fontStyle === "mixed" || appearance.fontStyle === "system" || appearance.fontStyle === "custom"
            ? appearance.fontStyle
            : "pixel";
    const customFontFamily =
        typeof appearance.customFontFamily === "string" ? sanitizeFontFamily(appearance.customFontFamily) : "";
    const chatLineLengthChRaw = typeof appearance.chatLineLengthCh === "number" ? appearance.chatLineLengthCh : 0;
    const chatLineLengthCh =
        Number.isFinite(chatLineLengthChRaw) && chatLineLengthChRaw > 0
            ? Math.min(120, Math.max(45, Math.round(chatLineLengthChRaw)))
            : 0;
    const customMessageSoundDataUrl =
        typeof notifications.customMessageSoundDataUrl === "string" &&
        notifications.customMessageSoundDataUrl.startsWith("data:")
            ? notifications.customMessageSoundDataUrl
            : null;
    const customMessageSoundName =
        typeof notifications.customMessageSoundName === "string" && notifications.customMessageSoundName.trim().length > 0
            ? notifications.customMessageSoundName
            : null;

    return {
        appearance: {
            theme,
            compactMode,
            showTimestamps,
            closeOnWindowCloseMinimize,
            accentColor,
            fontStyle: fontStyle === "custom" && !customFontFamily ? "system" : fontStyle,
            customFontFamily,
            pixelEmoji: appearance.pixelEmoji !== false,
            iconStyle: appearance.iconStyle === "smooth" ? "smooth" : "pixel",
            chatLineLengthCh,
            showSpaceChannelAvatars,
        },
        notifications: {
            notificationsEnabled: notifications.notificationsEnabled !== false,
            notificationBodyEnabled: notifications.notificationBodyEnabled !== false,
            audioNotificationsEnabled: notifications.audioNotificationsEnabled !== false,
            customMessageSoundDataUrl,
            customMessageSoundName,
            ringtoneEnabled: notifications.ringtoneEnabled !== false,
            soundStyle: notifications.soundStyle === "smooth" ? "smooth" : "pixel",
            customRingtoneDataUrl:
                typeof notifications.customRingtoneDataUrl === "string" && notifications.customRingtoneDataUrl.startsWith("data:audio/")
                    ? notifications.customRingtoneDataUrl
                    : null,
            customRingtoneName:
                typeof notifications.customRingtoneName === "string" && notifications.customRingtoneName.trim() ? notifications.customRingtoneName.slice(0, 80) : null,
        },
        privacy: {
            showReadReceipts: privacy.showReadReceipts !== false,
            allowDmsFromServerMembers: privacy.allowDmsFromServerMembers !== false,
            shareActivity: privacy.shareActivity !== false,
            shareStatus: privacy.shareStatus !== false,
        },
        audio: {
            preferredAudioInputId:
                typeof audio.preferredAudioInputId === "string" && audio.preferredAudioInputId.trim().length > 0
                    ? audio.preferredAudioInputId
                    : "default",
            preferredAudioOutputId:
                typeof audio.preferredAudioOutputId === "string" && audio.preferredAudioOutputId.trim().length > 0
                    ? audio.preferredAudioOutputId
                    : "default",
            micTestLoopbackEnabled: audio.micTestLoopbackEnabled === true,
            autoGainControlEnabled: audio.autoGainControlEnabled !== false,
            echoCancellationEnabled: audio.echoCancellationEnabled !== false,
            noiseSuppressionEnabled: audio.noiseSuppressionEnabled !== false,
            voiceIsolationEnabled: audio.voiceIsolationEnabled !== false,
            micProfile: audio.micProfile === "music" ? "music" : "speech",
            voiceEffect: normalizeVoiceEffect(audio.voiceEffect),
            othersSoundboardVolume:
                typeof audio.othersSoundboardVolume === "number" && Number.isFinite(audio.othersSoundboardVolume)
                    ? Math.max(0, Math.min(100, Math.round(audio.othersSoundboardVolume)))
                    : 100,
            soundboardVolume:
                typeof audio.soundboardVolume === "number" && Number.isFinite(audio.soundboardVolume)
                    ? Math.max(0, Math.min(100, Math.round(audio.soundboardVolume)))
                    : 80,
        },
    };
}

export function loadUserLocalSettings(): UserLocalSettings {
    if (typeof window === "undefined") {
        return { ...DEFAULT_SETTINGS };
    }

    try {
        const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_SETTINGS };
        }
        return normalizeSettings(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveUserLocalSettings(settings: UserLocalSettings): void {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function applyAppearanceTheme(settings: AppearanceSettings): void {
    if (typeof document === "undefined") {
        return;
    }

    const root = document.documentElement;
    root.setAttribute("data-theme", settings.theme);
    root.setAttribute("data-font", settings.fontStyle);
    root.setAttribute("data-pixel-emoji", settings.pixelEmoji === false ? "off" : "on");
    root.setAttribute("data-icon-style", settings.iconStyle === "smooth" ? "smooth" : "pixel");
    setIconStyle(settings.iconStyle === "smooth" ? "smooth" : "pixel");
    if (settings.fontStyle === "custom" && settings.customFontFamily) {
        root.style.setProperty("--font-custom", cssFontStack(settings.customFontFamily));
    } else {
        root.style.removeProperty("--font-custom");
    }
    for (const [name, value] of Object.entries(accentTokens(settings.accentColor, settings.theme))) {
        root.style.setProperty(name, value);
    }
    root.style.setProperty(
        "--timeline-text-max-width",
        settings.chatLineLengthCh > 0 ? `${settings.chatLineLengthCh}ch` : "none",
    );
}


const NOTIFICATIONS_ON_MIGRATION_KEY = "heorot.notifications_default_on.v1";

// Before v0.3.0 notifications defaulted to off, and that "off" was saved with everyone's settings, so the new
// default never reached existing installs. The desktop and Android apps switch them on once; turning them off
// afterwards sticks.
export function withNotificationsOnOnce(settings: UserLocalSettings): UserLocalSettings {
    if (typeof window === "undefined") {
        return settings;
    }
    const isApp =
        Boolean(window.heorotDesktop) ||
        (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === "android";
    try {
        if (!isApp || window.localStorage.getItem(NOTIFICATIONS_ON_MIGRATION_KEY)) {
            return settings;
        }
        window.localStorage.setItem(NOTIFICATIONS_ON_MIGRATION_KEY, "1");
    } catch {
        return settings;
    }
    return { ...settings, notifications: { ...settings.notifications, notificationsEnabled: true } };
}
