// SPDX-License-Identifier: AGPL-3.0-only
// Steam's text "VDF" (KeyValues) files: nested "key" "value" pairs and "key" { ... } blocks. Just enough of a parser
// to read registry.vdf, libraryfolders.vdf and appmanifest_<id>.acf. No imports, so the web unit tests cover it.

export type VdfObject = { [key: string]: string | VdfObject };

export function parseVdf(text: string): VdfObject {
    const tokens: string[] = [];
    const pattern = /"((?:[^"\\]|\\.)*)"|([{}])/g;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        tokens.push(match[2] ?? match[1].replace(/\\(.)/g, "$1"));
    }
    let index = 0;
    const readObject = (): VdfObject => {
        const object: VdfObject = {};
        while (index < tokens.length) {
            const key = tokens[index++];
            if (key === "}") break;
            const value = tokens[index++];
            if (value === undefined) break;
            // Keys are case-insensitive in Steam's files.
            object[key.toLowerCase()] = value === "{" ? readObject() : value;
        }
        return object;
    };
    return readObject();
}

// Looks a path up case-insensitively, e.g. ["registry", "hkcu", "software", "valve", "steam", "runningappid"].
export function vdfGet(object: VdfObject, path: string[]): string | VdfObject | undefined {
    let current: string | VdfObject | undefined = object;
    for (const key of path) {
        if (!current || typeof current === "string") return undefined;
        current = current[key.toLowerCase()];
    }
    return current;
}

// The running game's app ID from registry.vdf (Linux/macOS Steam); 0 or missing means nothing is running.
export function runningAppIdFromRegistry(text: string): string | null {
    const id = vdfGet(parseVdf(text), ["registry", "hkcu", "software", "valve", "steam", "runningappid"]);
    return typeof id === "string" && /^\d+$/.test(id) && id !== "0" ? id : null;
}

// Every Steam library folder listed in libraryfolders.vdf.
export function libraryPathsFrom(text: string): string[] {
    const folders = vdfGet(parseVdf(text), ["libraryfolders"]);
    if (!folders || typeof folders === "string") return [];
    return Object.values(folders)
        .map((entry) => (typeof entry === "string" ? entry : typeof entry.path === "string" ? entry.path : null))
        .filter((path): path is string => Boolean(path) && !/^\d+$/.test(path ?? ""));
}

export function gameNameFromManifest(text: string): string | null {
    const name = vdfGet(parseVdf(text), ["appstate", "name"]);
    return typeof name === "string" && name.trim() ? name.trim() : null;
}
