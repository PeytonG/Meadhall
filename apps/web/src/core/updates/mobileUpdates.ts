// SPDX-License-Identifier: AGPL-3.0-only
// Update notices for the phone apps. The desktop app updates itself; Android (and iOS) builds are installed by hand
// from the GitHub release, so the app checks the latest release and points people at it.

export const RELEASES_API = "https://api.github.com/repos/PeytonG/Meadhall/releases/latest";
export const RELEASES_PAGE = "https://github.com/PeytonG/Meadhall/releases/latest";
const CACHE_KEY = "heorot.mobile_latest_release.v1";
const NOTICE_KEY = "heorot.mobile_update_notice.v1";
const DISMISSED_KEY = "heorot.mobile_update_dismissed.v1";
const CHECK_EVERY_MS = 6 * 60 * 60_000;

// The version this build was made from (set by the release workflow); empty in development builds.
export function currentAppVersion(): string {
    const version = (import.meta.env.VITE_MEADHALL_VERSION as string | undefined) ?? "";
    return /^\d+\.\d+\.\d+/.test(version) ? version : "";
}

// Compares x.y.z versions; a pre-release ("1.2.0-beta") sorts before its release.
export function compareVersions(left: string, right: string): number {
    const parse = (value: string): { core: number[]; pre: string } => {
        const [core, pre = ""] = value.replace(/^v/, "").split("-", 2);
        return { core: core.split(".").map((part) => Number.parseInt(part, 10) || 0), pre };
    };
    const a = parse(left);
    const b = parse(right);
    for (let index = 0; index < 3; index += 1) {
        const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0);
        if (difference !== 0) return Math.sign(difference);
    }
    if (a.pre === b.pre) return 0;
    if (!a.pre) return 1;
    if (!b.pre) return -1;
    return a.pre < b.pre ? -1 : 1;
}

export interface LatestRelease {
    version: string;
    pageUrl: string;
    // Direct download for this platform, when the release has one.
    downloadUrl: string | null;
}

interface GitHubRelease {
    tag_name?: string;
    html_url?: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: Array<{ name?: string; browser_download_url?: string }>;
}

export function parseRelease(release: GitHubRelease, platform: "android" | "ios"): LatestRelease | null {
    if (!release.tag_name || release.draft || release.prerelease) return null;
    const assets = release.assets ?? [];
    const pick = (pattern: RegExp): string | null =>
        assets.find((asset) => asset.name && pattern.test(asset.name) && !/debug-signed/.test(asset.name))?.browser_download_url ??
        assets.find((asset) => asset.name && pattern.test(asset.name))?.browser_download_url ??
        null;
    return {
        version: release.tag_name.replace(/^v/, ""),
        pageUrl: release.html_url && /^https:\/\/github\.com\//.test(release.html_url) ? release.html_url : RELEASES_PAGE,
        downloadUrl: pick(platform === "android" ? /\.apk$/i : /\.ipa$/i),
    };
}

function readJson<T>(key: string): T | null {
    try {
        return JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Not remembered; checked again next time.
    }
}

// The newest release, from GitHub at most every few hours (unauthenticated API calls are rate-limited).
export async function fetchLatestRelease(platform: "android" | "ios", force = false): Promise<LatestRelease | null> {
    const cached = readJson<{ at: number; release: GitHubRelease }>(CACHE_KEY);
    let release = cached?.release ?? null;
    if (force || !cached || Date.now() - cached.at > CHECK_EVERY_MS) {
        const response = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
        if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
        release = (await response.json()) as GitHubRelease;
        writeJson(CACHE_KEY, { at: Date.now(), release });
    }
    return release ? parseRelease(release, platform) : null;
}

export function isUpdateNoticeEnabled(): boolean {
    return readJson<boolean>(NOTICE_KEY) !== false;
}

export function setUpdateNoticeEnabled(enabled: boolean): void {
    writeJson(NOTICE_KEY, enabled);
}

export function dismissedUpdateVersion(): string | null {
    return readJson<string>(DISMISSED_KEY);
}

export function dismissUpdateVersion(version: string): void {
    writeJson(DISMISSED_KEY, version);
}
