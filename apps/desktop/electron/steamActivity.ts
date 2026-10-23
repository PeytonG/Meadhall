// SPDX-License-Identifier: AGPL-3.0-only
// "Playing ..." from Steam, like Discord's game activity: Steam records the game it's running (Windows registry,
// or registry.vdf elsewhere) and each installed game's name is in its appmanifest. Read locally only: no Steam
// account, API key or network involved. MEADHALL_STEAM_DIR points the desktop tests at a fake Steam folder.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { gameNameFromManifest, libraryPathsFrom, runningAppIdFromRegistry } from "./vdf";

export interface Activity {
    name: string;
    appId: string;
    source: "steam";
}

function regQuery(key: string, value: string): Promise<string | null> {
    return new Promise((resolve) => {
        execFile("reg", ["query", key, "/v", value], { windowsHide: true, timeout: 3000 }, (error, stdout) => {
            if (error) return resolve(null);
            const match = new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`, "i").exec(stdout);
            resolve(match ? match[1].trim() : null);
        });
    });
}

async function readText(file: string): Promise<string | null> {
    return fs.readFile(file, "utf8").catch(() => null);
}

function candidateSteamDirs(): string[] {
    const home = os.homedir();
    return [
        path.join(home, ".steam", "steam"),
        path.join(home, ".local", "share", "Steam"),
        path.join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
        path.join(home, "Library", "Application Support", "Steam"),
    ];
}

async function steamDir(): Promise<string | null> {
    if (process.env.MEADHALL_STEAM_DIR) return process.env.MEADHALL_STEAM_DIR;
    if (process.platform === "win32") {
        const fromRegistry = await regQuery("HKCU\\Software\\Valve\\Steam", "SteamPath");
        return fromRegistry ? path.normalize(fromRegistry) : null;
    }
    for (const dir of candidateSteamDirs()) {
        if (await readText(path.join(dir, "steamapps", "libraryfolders.vdf"))) return dir;
    }
    return null;
}

async function runningAppId(dir: string): Promise<string | null> {
    if (process.platform === "win32" && !process.env.MEADHALL_STEAM_DIR) {
        const value = await regQuery("HKCU\\Software\\Valve\\Steam", "RunningAppID");
        const id = value ? String(Number.parseInt(value, value.startsWith("0x") ? 16 : 10)) : null;
        return id && id !== "0" && id !== "NaN" ? id : null;
    }
    const registry =
        (await readText(path.join(dir, "registry.vdf"))) ?? (await readText(path.join(os.homedir(), ".steam", "registry.vdf")));
    return registry ? runningAppIdFromRegistry(registry) : null;
}

async function gameName(dir: string, appId: string): Promise<string | null> {
    const libraries = libraryPathsFrom((await readText(path.join(dir, "steamapps", "libraryfolders.vdf"))) ?? "");
    for (const library of [dir, ...libraries]) {
        const manifest = await readText(path.join(library, "steamapps", `appmanifest_${appId}.acf`));
        const name = manifest ? gameNameFromManifest(manifest) : null;
        if (name) return name;
    }
    return null;
}

export async function currentActivity(): Promise<Activity | null> {
    try {
        const dir = await steamDir();
        if (!dir) return null;
        const appId = await runningAppId(dir);
        if (!appId) return null;
        const name = await gameName(dir, appId);
        return name ? { name, appId, source: "steam" } : null;
    } catch {
        return null;
    }
}
