// SPDX-License-Identifier: AGPL-3.0-only
// The parts of a profile beyond name and picture, like Discord's: a banner (image or GIF), About me, a public email
// and links. They live in the user's Matrix profile as extended-profile fields (MSC4133), so they are public: anyone
// who can look up the user can read them, which the settings page says next to the email field.

export const BANNER_KEY = "io.github.peytong.meadhall.banner";
export const ABOUT_KEY = "io.github.peytong.meadhall.about";
export const EMAIL_KEY = "io.github.peytong.meadhall.email";
export const LINKS_KEY = "io.github.peytong.meadhall.links";
// How the banner is cropped to the profile card's shape: the point (percent) to keep in view, and a zoom.
export const BANNER_CROP_KEY = "io.github.peytong.meadhall.banner_crop";

export const ABOUT_MAX_LENGTH = 400;
export const MAX_LINKS = 5;

export interface ProfileLink {
    label: string;
    url: string;
}

export interface BannerCrop {
    x: number; // 0-100
    y: number; // 0-100
    zoom: number; // 1-4
}

export const DEFAULT_BANNER_CROP: BannerCrop = { x: 50, y: 50, zoom: 1 };

export function parseBannerCrop(value: unknown): BannerCrop {
    if (!value || typeof value !== "object") return DEFAULT_BANNER_CROP;
    const record = value as Record<string, unknown>;
    const clamp = (raw: unknown, min: number, max: number, fallback: number): number =>
        typeof raw === "number" && Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
    return { x: clamp(record.x, 0, 100, 50), y: clamp(record.y, 0, 100, 50), zoom: clamp(record.zoom, 1, 4, 1) };
}

export interface RichProfile {
    bannerMxc: string | null;
    bannerCrop: BannerCrop;
    about: string;
    email: string;
    links: ProfileLink[];
}

export const EMPTY_RICH_PROFILE: RichProfile = { bannerMxc: null, bannerCrop: DEFAULT_BANNER_CROP, about: "", email: "", links: [] };

// Only web links: never javascript:, data: or anything else a stranger could put on their profile.
export function safeLinkUrl(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? url.toString() : null;
    } catch {
        return null;
    }
}

export function isPlausibleEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function parseLinks(value: unknown): ProfileLink[] {
    if (!Array.isArray(value)) return [];
    const links: ProfileLink[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const url = safeLinkUrl(record.url);
        if (!url) continue;
        const label = typeof record.label === "string" && record.label.trim() ? record.label.trim().slice(0, 40) : new URL(url).hostname;
        links.push({ label, url });
        if (links.length >= MAX_LINKS) break;
    }
    return links;
}

// Reads the fields out of a full profile response (GET /profile/{userId} returns every field).
export function parseRichProfile(profile: Record<string, unknown> | null | undefined): RichProfile {
    if (!profile) return EMPTY_RICH_PROFILE;
    const banner = profile[BANNER_KEY];
    const about = profile[ABOUT_KEY];
    const email = profile[EMAIL_KEY];
    return {
        bannerMxc: typeof banner === "string" && banner.startsWith("mxc://") ? banner : null,
        bannerCrop: parseBannerCrop(profile[BANNER_CROP_KEY]),
        about: typeof about === "string" ? about.slice(0, ABOUT_MAX_LENGTH) : "",
        email: typeof email === "string" && isPlausibleEmail(email) ? email.trim() : "",
        links: parseLinks(profile[LINKS_KEY]),
    };
}
