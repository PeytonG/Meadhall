// SPDX-License-Identifier: AGPL-3.0-only
// "What's new" after an update: the release notes for every version newer than the one this install last ran,
// taken from CHANGELOG.md (bundled at build time). The release workflow refuses to tag a version without a
// CHANGELOG section, so the notes are always there.
import { compareVersions } from "./mobileUpdates";

const SEEN_KEY = "meadhall.whats_new_seen_version";

// Read once at startup, before anyone signs in: an install that already had an account isn't new, even if it
// predates "What's new" (so updating from such a version still shows the notes).
const hadAccountAtStart = (() => {
    try {
        return typeof window !== "undefined" && window.localStorage.getItem("mx_user_id") !== null;
    } catch {
        return false;
    }
})();

export interface ReleaseNotes {
    version: string;
    date: string | null;
    // The section's markdown, without its "## vX.Y.Z" heading.
    body: string;
}

export function parseChangelog(markdown: string): ReleaseNotes[] {
    const notes: ReleaseNotes[] = [];
    let current: ReleaseNotes | null = null;
    for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
        const heading = /^## (?:v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)(?: \(([^)]*)\))?|.*)\s*$/.exec(line);
        if (line.startsWith("## ") && heading) {
            current = heading[1] ? { version: heading[1], date: heading[2] ?? null, body: "" } : null;
            if (current) notes.push(current);
            continue;
        }
        if (current) current.body += `${line}\n`;
    }
    return notes.map((note) => ({ ...note, body: note.body.trim() }));
}

// Notes for versions after `seen`, up to and including `current`, newest first.
export function notesSince(markdown: string, seen: string, current: string): ReleaseNotes[] {
    return parseChangelog(markdown)
        .filter((note) => compareVersions(note.version, seen) > 0 && compareVersions(note.version, current) <= 0)
        .sort((left, right) => compareVersions(right.version, left.version));
}

function read(): string | null {
    try {
        return window.localStorage.getItem(SEEN_KEY);
    } catch {
        return null;
    }
}

export function markVersionSeen(version: string): void {
    try {
        window.localStorage.setItem(SEEN_KEY, version);
    } catch {
        // Shown again next start.
    }
}

// What to show at start. A brand-new install just remembers the version: it isn't told what's "new".
export function pendingReleaseNotes(markdown: string, current: string, existingInstall = hadAccountAtStart): ReleaseNotes[] {
    if (!current) return [];
    const seen = read();
    if (!seen && existingInstall) {
        // Updated from a version before "What's new": show this release's notes.
        return parseChangelog(markdown).filter((note) => note.version === current);
    }
    if (!seen) {
        markVersionSeen(current);
        return [];
    }
    if (compareVersions(current, seen) <= 0) return [];
    const notes = notesSince(markdown, seen, current);
    if (notes.length === 0) markVersionSeen(current);
    return notes;
}
