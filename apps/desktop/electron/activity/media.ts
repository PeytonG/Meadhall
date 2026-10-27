// SPDX-License-Identifier: AGPL-3.0-only
// Linux: what's playing, from MPRIS (the standard every Linux music/video player speaks over D-Bus), shown as
// "Listening to ...". Uses playerctl when it's installed, otherwise dbus-send (part of D-Bus itself).
import { execFile } from "node:child_process";

export interface MediaActivity {
    player: string;
    title: string;
    artist?: string;
}

function run(command: string, args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
        execFile(command, args, { timeout: 3000, maxBuffer: 1024 * 1024 }, (error, stdout) => resolve(error ? null : String(stdout)));
    });
}

// playerctl -a metadata --format '{{status}}\t{{playerName}}\t{{artist}}\t{{title}}'
export function parsePlayerctl(output: string): MediaActivity | null {
    for (const line of output.split("\n")) {
        const [status, player, artist, title] = line.split("\t");
        if (status === "Playing" && title?.trim()) {
            return { player: player?.trim() || "player", title: title.trim(), artist: artist?.trim() || undefined };
        }
    }
    return null;
}

// `dbus-send --print-reply ... ListNames`: the MPRIS players are the org.mpris.MediaPlayer2.* names.
export function parsePlayerNames(output: string): string[] {
    return [...output.matchAll(/string "(org\.mpris\.MediaPlayer2\.[^"]+)"/g)].map((match) => match[1]!);
}

// The reply to Properties.Get Metadata: dict entries of a key and a variant (a string, or an array of strings).
export function parseMetadata(output: string): { title?: string; artist?: string } {
    const field = (key: string): string | undefined => {
        const start = output.indexOf(`string "${key}"`);
        if (start < 0) return undefined;
        const rest = output.slice(start + key.length + 9);
        const end = rest.search(/dict entry\(/);
        const value = [...(end < 0 ? rest : rest.slice(0, end)).matchAll(/string "((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]!);
        return value.length ? value.join(", ") : undefined;
    };
    return { title: field("xesam:title"), artist: field("xesam:artist") };
}

async function viaDbus(): Promise<MediaActivity | null> {
    const names = await run("dbus-send", ["--session", "--print-reply", "--dest=org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus.ListNames"]);
    if (!names) return null;
    for (const name of parsePlayerNames(names)) {
        const get = (property: string): Promise<string | null> =>
            run("dbus-send", ["--session", "--print-reply", `--dest=${name}`, "/org/mpris/MediaPlayer2", "org.freedesktop.DBus.Properties.Get", "string:org.mpris.MediaPlayer2.Player", `string:${property}`]);
        if (!(await get("PlaybackStatus"))?.includes('"Playing"')) continue;
        const metadata = await get("Metadata");
        const { title, artist } = metadata ? parseMetadata(metadata) : {};
        if (title) return { player: name.slice("org.mpris.MediaPlayer2.".length).split(".")[0]!, title, artist };
    }
    return null;
}

export async function currentMedia(): Promise<MediaActivity | null> {
    if (process.platform !== "linux") return null;
    const playerctl = await run("playerctl", ["-a", "metadata", "--format", "{{status}}\t{{playerName}}\t{{artist}}\t{{title}}"]);
    if (playerctl !== null) return parsePlayerctl(playerctl);
    return viaDbus();
}
