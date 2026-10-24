// SPDX-License-Identifier: AGPL-3.0-only
// Profile style, like Discord's profile themes and nameplates: a gradient behind your profile card, and one behind your
// name in member lists. Public, in the profile like the banner (STYLE_KEY). Only preset names or plain #rrggbb colors
// are accepted, so nothing else from a stranger's profile ever reaches the page's styles.
export const STYLE_KEY = "io.github.peytong.meadhall.profile_style";

export const GRADIENT_PRESETS = {
    mead: { label: "Mead", colors: ["#f5a623", "#7a3b00"] },
    ember: { label: "Ember", colors: ["#ff7a18", "#8e0e00"] },
    rose: { label: "Rose", colors: ["#ff6fa5", "#6b1f4f"] },
    dusk: { label: "Dusk", colors: ["#a855f7", "#1e1b4b"] },
    aurora: { label: "Aurora", colors: ["#2dd4bf", "#7c3aed"] },
    ocean: { label: "Ocean", colors: ["#38bdf8", "#0c2d6b"] },
    forest: { label: "Forest", colors: ["#4ade80", "#14532d"] },
    frost: { label: "Frost", colors: ["#e0f2fe", "#64748b"] },
    gold: { label: "Gold", colors: ["#fde68a", "#a16207"] },
    void: { label: "Void", colors: ["#6d28d9", "#020617"] },
} as const satisfies Record<string, { label: string; colors: readonly [string, string] }>;

export type GradientPreset = keyof typeof GRADIENT_PRESETS;
export type GradientChoice = { preset: GradientPreset } | { colors: [string, string] };

export interface ProfileStyle {
    card: GradientChoice | null;
    nameplate: GradientChoice | null;
}

export const EMPTY_PROFILE_STYLE: ProfileStyle = { card: null, nameplate: null };

const HEX = /^#[0-9a-f]{6}$/i;

function parseChoice(value: unknown): GradientChoice | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.preset === "string" && record.preset in GRADIENT_PRESETS) return { preset: record.preset as GradientPreset };
    if (Array.isArray(record.colors) && record.colors.length === 2 && record.colors.every((color) => typeof color === "string" && HEX.test(color))) {
        return { colors: [String(record.colors[0]).toLowerCase(), String(record.colors[1]).toLowerCase()] };
    }
    return null;
}

export function parseProfileStyle(value: unknown): ProfileStyle {
    if (!value || typeof value !== "object") return EMPTY_PROFILE_STYLE;
    const record = value as Record<string, unknown>;
    return { card: parseChoice(record.card), nameplate: parseChoice(record.nameplate) };
}

export function gradientColors(choice: GradientChoice | null): [string, string] | null {
    if (!choice) return null;
    if ("preset" in choice) {
        const [from, to] = GRADIENT_PRESETS[choice.preset].colors;
        return [from, to];
    }
    return choice.colors;
}

function mix(from: string, to: string, amount: number): string {
    const channel = (hex: string, index: number): number => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
    const value = [0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount));
    return `#${value.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

// The CSS gradient. Pixel style draws it in hard bands, like a sprite; smooth is a normal gradient.
export function gradientCss(colors: [string, string], options: { pixel: boolean; angle?: number; bands?: number }): string {
    const angle = options.angle ?? 160;
    if (!options.pixel) return `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1]})`;
    const bands = options.bands ?? 6;
    const stops: string[] = [];
    for (let index = 0; index < bands; index += 1) {
        const color = mix(colors[0], colors[1], index / (bands - 1));
        stops.push(`${color} ${((index / bands) * 100).toFixed(2)}%`, `${color} ${(((index + 1) / bands) * 100).toFixed(2)}%`);
    }
    return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
}
