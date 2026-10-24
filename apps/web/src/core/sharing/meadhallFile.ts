// SPDX-License-Identifier: AGPL-3.0-only
// .meadhall files: soundboard sounds and style profiles people share with each other (Settings → Sharing). A small
// JSON document with a "meadhall" header, one item per file. Everything read from one is checked strictly: a file
// from someone else can only ever add a short sound or a set of known appearance settings, nothing else.
export const MEADHALL_FILE_EXTENSION = ".meadhall";
export const MEADHALL_MIME = "application/x-meadhall";
// Marks a chat message carrying a .meadhall file, with a summary so the card can show what it adds before download.
export const SHARE_CONTENT_KEY = "io.github.peytong.meadhall.share";

export const MAX_MEADHALL_FILE_BYTES = 2 * 1024 * 1024;
const MAX_AUDIO_BYTES = 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/ogg", "audio/webm", "audio/mp4", "audio/aac", "audio/flac"]);

export interface SharedSound {
    kind: "sound";
    name: string;
    emoji: string;
    mime: string;
    // The sound itself, base64.
    audio: string;
}

// The appearance settings a style profile carries (never behavior like closing to the tray).
export interface StyleSettings {
    theme?: string;
    accentColor?: string;
    fontStyle?: string;
    customFontFamily?: string;
    pixelEmoji?: boolean;
    iconStyle?: "pixel" | "smooth";
    compactMode?: boolean;
    showTimestamps?: boolean;
    chatLineLengthCh?: number;
    showSpaceChannelAvatars?: boolean;
}

export interface SharedStyle {
    kind: "style";
    name: string;
    appearance: StyleSettings;
    // Card gradient and nameplate (core/profile/profileStyle.ts), if the profile has them.
    profileStyle?: unknown;
}

export type MeadhallItem = SharedSound | SharedStyle;

export interface ShareSummary {
    kind: "sound" | "style";
    name: string;
    emoji?: string;
}

const THEMES = new Set(["dark", "light", "contrast"]);
const FONT_STYLES = new Set(["pixel", "mixed", "system", "custom"]);
const HEX = /^#[0-9a-f]{6}$/i;

function cleanName(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 32) : fallback;
}

export function cleanStyleSettings(value: unknown): StyleSettings {
    const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const out: StyleSettings = {};
    if (typeof input.theme === "string" && THEMES.has(input.theme)) out.theme = input.theme;
    if (typeof input.accentColor === "string" && HEX.test(input.accentColor)) out.accentColor = input.accentColor.toLowerCase();
    if (typeof input.fontStyle === "string" && FONT_STYLES.has(input.fontStyle)) out.fontStyle = input.fontStyle;
    // A font name only (letters, digits, spaces and a few separators), never CSS.
    if (typeof input.customFontFamily === "string" && /^[\w \-.,'"]{0,64}$/.test(input.customFontFamily)) out.customFontFamily = input.customFontFamily;
    if (typeof input.pixelEmoji === "boolean") out.pixelEmoji = input.pixelEmoji;
    if (input.iconStyle === "pixel" || input.iconStyle === "smooth") out.iconStyle = input.iconStyle;
    if (typeof input.compactMode === "boolean") out.compactMode = input.compactMode;
    if (typeof input.showTimestamps === "boolean") out.showTimestamps = input.showTimestamps;
    if (typeof input.chatLineLengthCh === "number" && Number.isFinite(input.chatLineLengthCh)) out.chatLineLengthCh = Math.min(200, Math.max(40, Math.round(input.chatLineLengthCh)));
    if (typeof input.showSpaceChannelAvatars === "boolean") out.showSpaceChannelAvatars = input.showSpaceChannelAvatars;
    return out;
}

export function encodeMeadhallFile(item: MeadhallItem): string {
    return JSON.stringify({ format: "meadhall", version: 1, ...item });
}

export function base64Length(base64: string): number {
    return Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

// Throws a plain-language error for anything that isn't a valid .meadhall file.
export function parseMeadhallFile(text: string): MeadhallItem {
    if (text.length > MAX_MEADHALL_FILE_BYTES * 1.5) throw new Error("That .meadhall file is too big.");
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error("That isn't a .meadhall file.");
    }
    if (!data || data.format !== "meadhall") throw new Error("That isn't a .meadhall file.");
    if (data.version !== 1) throw new Error("This .meadhall file is from a newer Meadhall. Update to open it.");
    if (data.kind === "sound") {
        const mime = typeof data.mime === "string" ? data.mime.toLowerCase() : "";
        const audio = typeof data.audio === "string" ? data.audio : "";
        if (!AUDIO_TYPES.has(mime)) throw new Error("That sound's format isn't supported.");
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || base64Length(audio) > MAX_AUDIO_BYTES) throw new Error("That sound is too big or damaged.");
        return {
            kind: "sound",
            name: cleanName(data.name, "Sound"),
            emoji: typeof data.emoji === "string" && data.emoji.trim() ? [...data.emoji.trim()].slice(0, 2).join("") : "🔊",
            mime,
            audio,
        };
    }
    if (data.kind === "style") {
        const appearance = cleanStyleSettings(data.appearance);
        if (Object.keys(appearance).length === 0 && !data.profileStyle) throw new Error("That style profile is empty.");
        return { kind: "style", name: cleanName(data.name, "Style"), appearance, ...(data.profileStyle ? { profileStyle: data.profileStyle } : {}) };
    }
    throw new Error("This .meadhall file has something Meadhall doesn't know yet. Update to open it.");
}

export function parseShareSummary(value: unknown): ShareSummary | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.kind !== "sound" && record.kind !== "style") return null;
    return {
        kind: record.kind,
        name: cleanName(record.name, record.kind === "sound" ? "Sound" : "Style"),
        ...(record.kind === "sound" && typeof record.emoji === "string" ? { emoji: [...record.emoji].slice(0, 2).join("") } : {}),
    };
}

export function summaryOf(item: MeadhallItem): ShareSummary {
    return item.kind === "sound" ? { kind: "sound", name: item.name, emoji: item.emoji } : { kind: "style", name: item.name };
}

export function fileNameFor(item: MeadhallItem): string {
    return `${item.name.replace(/[^\w\- ]+/g, "").trim() || item.kind}${MEADHALL_FILE_EXTENSION}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}
