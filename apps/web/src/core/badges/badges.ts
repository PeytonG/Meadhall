// SPDX-License-Identifier: AGPL-3.0-only
// Badges by people's names, like Discord's. Official badges come only from the Meadhall owner's signed list (see
// scripts/badges.mjs): the app checks the signature against BADGE_PUBLIC_KEY and matches people by a salted, slow
// fingerprint of their user ID, so the published list doesn't say who has them.
//
// Anything else claiming a badge (the profile field UNOFFICIAL_BADGES_FIELD, which modified copies of the app might set)
// is shown separately behind "...", marked as not from Meadhall.
import { BADGE_LIST_URL, BADGE_PUBLIC_KEY } from "./badgeKey";

export type BadgeId = "founder";

export const BADGES: Record<BadgeId, { label: string; description: string }> = {
    founder: { label: "Founder", description: "A founding member of Meadhall" },
};

export const UNOFFICIAL_BADGES_FIELD = "io.github.peytong.meadhall.badges";

const CACHE_KEY = "meadhall.badges.v1";
const REFRESH_MS = 6 * 60 * 60 * 1000;

export interface BadgeList {
    salt: string;
    iterations: number;
    entries: Record<string, BadgeId[]>;
    issued: string;
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function toBase64Url(bytes: ArrayBuffer): string {
    let binary = "";
    for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Checks the signature and shape; anything wrong means no badges (never an error shown to people).
export async function verifyBadgeList(signed: unknown, publicKey = BADGE_PUBLIC_KEY): Promise<BadgeList | null> {
    try {
        if (!signed || typeof signed !== "object") return null;
        const { payload, signature } = signed as { payload?: unknown; signature?: unknown };
        if (typeof payload !== "string" || typeof signature !== "string" || payload.length > 1_000_000) return null;
        const key = await crypto.subtle.importKey("spki", fromBase64(publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromBase64(signature), new TextEncoder().encode(payload));
        if (!valid) return null;
        const parsed = JSON.parse(payload) as Partial<BadgeList> & { version?: unknown };
        if (parsed.version !== 1 || typeof parsed.salt !== "string" || typeof parsed.iterations !== "number" || !parsed.entries || typeof parsed.entries !== "object") return null;
        if (parsed.iterations < 1000 || parsed.iterations > 1_000_000) return null;
        const entries: Record<string, BadgeId[]> = {};
        for (const [fingerprint, badges] of Object.entries(parsed.entries)) {
            if (Array.isArray(badges)) entries[fingerprint] = badges.filter((badge): badge is BadgeId => typeof badge === "string" && badge in BADGES);
        }
        return { salt: parsed.salt, iterations: parsed.iterations, entries, issued: typeof parsed.issued === "string" ? parsed.issued : "" };
    } catch {
        return null;
    }
}

// Same as fingerprint() in scripts/badges.mjs: PBKDF2-SHA256 of the user ID with the list's salt.
export async function fingerprint(userId: string, list: Pick<BadgeList, "salt" | "iterations">): Promise<string> {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(userId), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(list.salt), iterations: list.iterations }, key, 256);
    return toBase64Url(bits);
}

// The current list: verified from the local copy straight away, refreshed from GitHub now and then.
let current: BadgeList | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const fingerprints = new Map<string, Promise<BadgeId[]>>();

function setList(list: BadgeList | null): void {
    if (list && current && list.salt === current.salt) return;
    current = list;
    fingerprints.clear();
    listeners.forEach((listener) => listener());
}

export function onBadgeListChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function loadBadgeList(fetcher: typeof fetch = fetch): Promise<void> {
    loading ??= (async () => {
        let cached: { signed: unknown; fetchedAt: number } | null = null;
        try {
            cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null");
        } catch {
            cached = null;
        }
        if (cached) setList(await verifyBadgeList(cached.signed));
        if (cached && Date.now() - cached.fetchedAt < REFRESH_MS) return;
        try {
            const response = await fetcher(BADGE_LIST_URL, { cache: "no-cache", credentials: "omit" });
            if (!response.ok) return;
            const signed = (await response.json()) as unknown;
            const list = await verifyBadgeList(signed);
            if (!list) return; // a tampered or broken file never replaces a good one
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({ signed, fetchedAt: Date.now() }));
            setList(list);
        } catch {
            // Offline: keep what we have.
        }
    })().finally(() => {
        loading = null;
    });
    return loading;
}

export function officialBadgesFor(userId: string): Promise<BadgeId[]> {
    const list = current;
    if (!list || Object.keys(list.entries).length === 0) return Promise.resolve([]);
    let found = fingerprints.get(userId);
    if (!found) {
        found = fingerprint(userId, list).then((print) => list.entries[print] ?? []).catch(() => []);
        fingerprints.set(userId, found);
    }
    return found;
}

// Badges someone's profile claims that the official list doesn't back up.
export function parseClaimedBadges(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((badge) => (typeof badge === "string" ? badge : badge && typeof badge === "object" ? String((badge as { label?: unknown; id?: unknown }).label ?? (badge as { id?: unknown }).id ?? "") : ""))
        .map((label) => label.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 10);
}
