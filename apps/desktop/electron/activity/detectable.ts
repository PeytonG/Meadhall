// SPDX-License-Identifier: AGPL-3.0-only
// The game list arRPC ships (Discord's "detectable applications": an id, a name and the executables of each).
// Used to name Rich Presence apps and to recognise running games. Read from disk on first use only (about 4 MB),
// and never fetched from the network. MEADHALL_DETECTABLE_DB points the tests at a small list.
import fs from "node:fs";
import path from "node:path";

interface DetectableExecutable {
    name: string;
    os?: string;
    is_launcher?: boolean;
    arguments?: string;
}

export interface DetectableApp {
    id: string;
    name: string;
    executables?: DetectableExecutable[];
}

interface Index {
    nameById: Map<string, string>;
    // Keyed by the executable's file name (lower case), e.g. "minecraft.exe".
    byFile: Map<string, Array<{ app: DetectableApp; executable: DetectableExecutable }>>;
}

let index: Index | null = null;

function dbPath(): string {
    if (process.env.MEADHALL_DETECTABLE_DB) return process.env.MEADHALL_DETECTABLE_DB;
    return path.join(path.dirname(require.resolve("arrpc/package.json")), "src", "process", "detectable.json");
}

function load(): Index {
    if (index) return index;
    const nameById = new Map<string, string>();
    const byFile: Index["byFile"] = new Map();
    let apps: DetectableApp[] = [];
    try {
        apps = JSON.parse(fs.readFileSync(dbPath(), "utf8")) as DetectableApp[];
    } catch {
        apps = [];
    }
    for (const app of Array.isArray(apps) ? apps : []) {
        if (typeof app?.id !== "string" || typeof app.name !== "string") continue;
        nameById.set(app.id, app.name);
        for (const executable of app.executables ?? []) {
            if (typeof executable?.name !== "string" || executable.is_launcher) continue;
            const file = executable.name.replace(/^>/, "").split("/").pop()?.toLowerCase();
            if (!file) continue;
            const list = byFile.get(file) ?? [];
            list.push({ app, executable });
            byFile.set(file, list);
        }
    }
    index = { nameById, byFile };
    return index;
}

export function appNameForId(id: string): string | null {
    return load().nameById.get(id) ?? null;
}

// arRPC's matching: the database lists "game.exe", "bin/x64/game.exe", or ">game.exe" (exactly that file);
// the full process path has to end with it (so "bin/x64/game.exe" doesn't match every program called game.exe).
export function matchProcess(processPath: string, args: string[] = []): DetectableApp | null {
    const normalized = processPath.toLowerCase().replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean);
    const file = parts.at(-1);
    if (!file) return null;
    const candidates = load().byFile.get(file);
    if (!candidates) return null;
    const suffixes = new Set<string>();
    for (let i = 1; i <= parts.length; i += 1) {
        const suffix = parts.slice(-i).join("/");
        suffixes.add(suffix);
        for (const variant of [suffix.replace("64", ""), suffix.replace(".x64", ""), suffix.replace("x64", ""), suffix.replace("_64", "")]) suffixes.add(variant);
    }
    for (const { app, executable } of candidates) {
        const wanted = executable.name.toLowerCase();
        const matches = wanted.startsWith(">") ? wanted.slice(1) === file : suffixes.has(wanted);
        if (!matches) continue;
        if (executable.arguments && !args.join(" ").includes(executable.arguments)) continue;
        return app;
    }
    return null;
}

export function resetDetectableForTests(): void {
    index = null;
}
