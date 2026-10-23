// SPDX-License-Identifier: AGPL-3.0-only
import type { AppTheme } from "../settings/user/settingsStore";

// Bright purple. Users can pick any accent with the pixel color wheel in Appearance settings.
export const DEFAULT_ACCENT_COLOR = "#a64dff";

// Page backgrounds the accent has to stay readable against (see --bg-main in App.css / settings/styles.css).
const BACKGROUND: Record<AppTheme, string> = { dark: "#1a1b1e", light: "#ffffff", contrast: "#000000" };
// WCAG: 3:1 for large text and UI parts; high contrast asks for the AAA 7:1.
const MIN_CONTRAST_WITH_BACKGROUND: Record<AppTheme, number> = { dark: 3, light: 3, contrast: 7 };
const DARK_TEXT = "#14091f";

type Rgb = [number, number, number];

export function normalizeHexColor(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value.trim());
    if (!match) return null;
    const hex = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
    return `#${hex.toLowerCase()}`;
}

function toRgb(hex: string): Rgb {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: Rgb): string {
    return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function mix(color: Rgb, target: Rgb, amount: number): Rgb {
    return color.map((channel, index) => channel + (target[index] - channel) * amount) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
    const linear = [r, g, b].map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(first: string, second: string): number {
    const [lighter, darker] = [luminance(toRgb(first)), luminance(toRgb(second))].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

export function hsvToHex(hue: number, saturation: number, value: number): string {
    const chroma = value * saturation;
    const sector = (((hue % 360) + 360) % 360) / 60;
    const x = chroma * (1 - Math.abs((sector % 2) - 1));
    const [r, g, b]: Rgb =
        sector < 1 ? [chroma, x, 0] : sector < 2 ? [x, chroma, 0] : sector < 3 ? [0, chroma, x]
        : sector < 4 ? [0, x, chroma] : sector < 5 ? [x, 0, chroma] : [chroma, 0, x];
    const offset = value - chroma;
    return toHex([(r + offset) * 255, (g + offset) * 255, (b + offset) * 255]);
}

export function hexToHsv(hex: string): { hue: number; saturation: number; value: number } {
    const [r, g, b] = toRgb(hex).map((channel) => channel / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    let hue = 0;
    if (delta > 0) {
        if (max === r) hue = 60 * (((g - b) / delta) % 6);
        else if (max === g) hue = 60 * ((b - r) / delta + 2);
        else hue = 60 * ((r - g) / delta + 4);
    }
    return { hue: (hue + 360) % 360, saturation: max === 0 ? 0 : delta / max, value: max };
}

// The CSS custom properties for an accent color, adjusted so it stays readable on the theme's background.
export function accentTokens(accentHex: string, theme: AppTheme): Record<string, string> {
    const background = BACKGROUND[theme];
    const towards: Rgb = theme === "light" ? [0, 0, 0] : [255, 255, 255];
    let primary = toRgb(normalizeHexColor(accentHex) ?? DEFAULT_ACCENT_COLOR);
    for (let step = 0; step < 20 && contrastRatio(toHex(primary), background) < MIN_CONTRAST_WITH_BACKGROUND[theme]; step += 1) {
        primary = mix(primary, towards, 0.1);
    }
    const primaryHex = toHex(primary);
    const onPrimary = contrastRatio(primaryHex, "#ffffff") >= contrastRatio(primaryHex, DARK_TEXT) ? "#ffffff" : DARK_TEXT;
    return {
        "--primary": primaryHex,
        "--accent": primaryHex,
        "--accent-soft": toHex(mix(primary, towards, 0.3)),
        "--primary-rgb": primary.map(Math.round).join(", "),
        "--on-primary": onPrimary,
    };
}
