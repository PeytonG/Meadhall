// SPDX-License-Identifier: AGPL-3.0-only
// Matching people by what you type: display name ("Peyton Gnadinger"), username (peytongna) or full user ID
// (@peytongna:example.org). Every word typed must appear (any order, accents ignored), so "gnad pey" finds
// "Peyton Gnadinger". Pure string work, cheap enough to run on every keystroke.

export function foldForSearch(text: string): string {
    return text
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLocaleLowerCase()
        .trim();
}

function searchableText(userId: string, displayName: string | null | undefined): string {
    const localpart = userId.replace(/^@/, "").split(":")[0] ?? "";
    return foldForSearch(`${displayName ?? ""} ${localpart} ${userId}`);
}

export function matchesUserSearch(term: string, userId: string, displayName: string | null | undefined): boolean {
    const words = foldForSearch(term).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return true;
    }
    const haystack = searchableText(userId, displayName);
    return words.every((word) => haystack.includes(word));
}

// Lower is better: exact matches first, then names or usernames starting with what was typed, then word starts,
// then anything containing it.
export function userSearchScore(term: string, userId: string, displayName: string | null | undefined): number {
    const folded = foldForSearch(term).replace(/^@/, "");
    const name = foldForSearch(displayName ?? "");
    const id = foldForSearch(userId).replace(/^@/, "");
    const localpart = id.split(":")[0] ?? "";
    if (!folded) {
        return 9;
    }
    if (id === folded || localpart === folded || name === folded) {
        return 0;
    }
    if (name.startsWith(folded) || localpart.startsWith(folded)) {
        return 1;
    }
    const firstWord = folded.split(/\s+/)[0] ?? folded;
    if (name.split(/\s+/).some((word) => word.startsWith(firstWord))) {
        return 2;
    }
    if (matchesUserSearch(term, userId, displayName)) {
        return 3;
    }
    return 9;
}
