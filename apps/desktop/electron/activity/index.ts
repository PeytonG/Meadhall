// SPDX-License-Identifier: AGPL-3.0-only
// Everything the desktop app can tell about what you're doing, for the app to share (or not; the choices of what
// and with whom are made in the app, Settings → Privacy → Activity). Each source only runs when asked for.
import { currentActivity as steamActivity } from "../steamActivity";
import { runningGames } from "./gameDetection";
import { currentMedia } from "./media";
import { currentRpcActivities, startRichPresence, stopRichPresence, type ActivityKind } from "./richPresence";

export interface DesktopActivity {
    source: "rpc" | "steam" | "game" | "media";
    kind: ActivityKind;
    name: string;
    details?: string;
    state?: string;
    appId?: string;
    startedAt?: number;
}

export interface ActivityOptions {
    steam: boolean;
    richPresence: boolean;
    games: boolean;
    media: boolean;
}

export function parseActivityOptions(value: unknown): ActivityOptions {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return { steam: record.steam === true, richPresence: record.richPresence === true, games: record.games === true, media: record.media === true };
}

export async function setRichPresenceEnabled(enabled: boolean): Promise<void> {
    if (enabled) await startRichPresence();
    else stopRichPresence();
}

// Most specific first: what an app says about itself, then Steam, then a recognised game, then media.
export async function currentActivities(options: ActivityOptions): Promise<DesktopActivity[]> {
    const [steam, games, media] = await Promise.all([
        options.steam ? steamActivity() : null,
        options.games ? runningGames() : [],
        options.media ? currentMedia() : null,
    ]);
    const list: DesktopActivity[] = [];
    if (options.richPresence) {
        for (const activity of currentRpcActivities()) {
            list.push({ source: "rpc", kind: activity.kind, name: activity.name, details: activity.details, state: activity.state, appId: activity.appId, startedAt: activity.startedAt });
        }
    }
    if (steam) list.push({ source: "steam", kind: "playing", name: steam.name, appId: steam.appId });
    for (const game of games) list.push({ source: "game", kind: "playing", name: game.name, appId: game.id, startedAt: game.startedAt });
    if (media) list.push({ source: "media", kind: "listening", name: media.title, details: media.artist ? `by ${media.artist}` : undefined, state: media.player });
    // One entry per name (Steam and the game list often both find the same game).
    const seen = new Set<string>();
    return list.filter((activity) => {
        const key = `${activity.kind}:${activity.name.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
