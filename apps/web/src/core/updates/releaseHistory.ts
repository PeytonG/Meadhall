// SPDX-License-Identifier: AGPL-3.0-only
// Earlier releases to roll back to (desktop app, Settings → Updates).
import { compareVersions } from "./mobileUpdates";

const RELEASES_LIST = "https://api.github.com/repos/PeytonG/Meadhall/releases?per_page=50";

// Versions before this one can't install other versions themselves: going back to one of them means updating to
// the newest version before you can choose an older one again.
export const FIRST_VERSION_WITH_ROLLBACK = "0.3.2";

export function cannotRollBackFrom(version: string): boolean {
    return compareVersions(version, FIRST_VERSION_WITH_ROLLBACK) < 0;
}

interface GitHubRelease {
    tag_name?: string;
    draft?: boolean;
    prerelease?: boolean;
    published_at?: string | null;
}

export interface ReleaseChoice {
    version: string;
    publishedAt: string | null;
}

// Published releases (no drafts or pre-releases) other than the one running, newest first.
export function releaseChoices(releases: GitHubRelease[], current: string): ReleaseChoice[] {
    return releases
        .filter((release) => !release.draft && !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name ?? ""))
        .map((release) => ({ version: release.tag_name!.slice(1), publishedAt: release.published_at ?? null }))
        .filter((release) => release.version !== current)
        .sort((left, right) => compareVersions(right.version, left.version));
}

export async function fetchReleaseChoices(current: string): Promise<ReleaseChoice[]> {
    const response = await fetch(RELEASES_LIST, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return releaseChoices((await response.json()) as GitHubRelease[], current);
}
