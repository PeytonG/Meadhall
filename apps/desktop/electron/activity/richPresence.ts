// SPDX-License-Identifier: AGPL-3.0-only
// Discord Rich Presence for Meadhall: games and apps that show "Playing ..." in Discord talk to a local server
// (a named pipe / Unix socket, and a localhost WebSocket). arRPC's two transports host it; Meadhall answers only
// SET_ACTIVITY and ignores everything else (invites, deep links). Off unless turned on in Settings → Privacy.
//
// - The WebSocket only accepts connections without an Origin (local apps) or from discord.com (arRPC's check), so
//   web pages can't set your status.
// - App names come from the local game list; nothing is looked up online. An app that isn't in it shows its own
//   details line instead (e.g. "Editing main.ts").
import { appNameForId } from "./detectable";

export type ActivityKind = "playing" | "listening" | "watching" | "competing";

export interface RpcActivity {
    appId: string;
    name: string;
    kind: ActivityKind;
    details?: string;
    state?: string;
    startedAt?: number;
    updatedAt: number;
}

type RpcSocket = { socketId?: string; clientId?: string; send?: (message: unknown) => void; close?: () => void };
type Handlers = {
    connection: (socket: RpcSocket) => void;
    message: (socket: RpcSocket, message: { cmd?: unknown; args?: unknown; nonce?: unknown }) => void;
    close: (socket: RpcSocket) => void;
};
type Closable = { server?: { close: () => void }; http?: { close: () => void }; wss?: { close: () => void; clients?: Set<{ terminate: () => void }> } };

const activities = new Map<string, RpcActivity>();
let servers: Closable[] = [];
let starting: Promise<void> | null = null;
let nextSocketId = 0;

const KINDS: Record<number, ActivityKind> = { 0: "playing", 2: "listening", 3: "watching", 5: "competing" };

function clean(value: unknown, max = 128): string | undefined {
    if (typeof value !== "string") return undefined;
    // eslint-disable-next-line no-control-regex
    const text = value.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "").trim().slice(0, max);
    return text || undefined;
}

function timestamp(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
    // Apps send seconds or milliseconds.
    return value < 10_000_000_000 ? Math.floor(value * 1000) : Math.floor(value);
}

export function activityFromRpc(clientId: string, raw: unknown, now = Date.now()): RpcActivity | null {
    if (!raw || typeof raw !== "object") return null;
    const activity = raw as { name?: unknown; details?: unknown; state?: unknown; type?: unknown; timestamps?: { start?: unknown } };
    const details = clean(activity.details);
    const state = clean(activity.state);
    const known = /^\d{5,25}$/.test(clientId) ? appNameForId(clientId) : null;
    const name = known ?? clean(activity.name) ?? details ?? state;
    if (!name) return null;
    return {
        appId: clientId,
        name,
        kind: KINDS[typeof activity.type === "number" ? activity.type : 0] ?? "playing",
        details: name === details ? undefined : details,
        state: name === state ? undefined : state,
        startedAt: timestamp(activity.timestamps?.start),
        updatedAt: now,
    };
}

function handlers(): Handlers {
    return {
        connection(socket) {
            socket.socketId = String(nextSocketId++);
            // What Discord sends first; apps wait for it before setting an activity.
            socket.send?.({
                cmd: "DISPATCH",
                evt: "READY",
                nonce: null,
                data: {
                    v: 1,
                    config: { cdn_host: "cdn.discordapp.com", api_endpoint: "//discord.com/api", environment: "production" },
                    user: { id: "0", username: "meadhall", discriminator: "0", global_name: "Meadhall", avatar: null, bot: false, flags: 0, premium_type: 0 },
                },
            });
        },
        message(socket, { cmd, args, nonce }) {
            if (cmd !== "SET_ACTIVITY") {
                socket.send?.({ cmd, evt: "ERROR", nonce, data: { code: 4000, message: "Not supported by Meadhall" } });
                return;
            }
            const key = socket.socketId ?? "?";
            const activity = activityFromRpc(socket.clientId ?? "", (args as { activity?: unknown } | undefined)?.activity);
            if (activity) activities.set(key, activity);
            else activities.delete(key);
            socket.send?.({ cmd, evt: null, nonce, data: activity ? { name: "", application_id: socket.clientId, type: 0 } : null });
        },
        close(socket) {
            activities.delete(socket.socketId ?? "?");
        },
    };
}

export function startRichPresence(): Promise<void> {
    if (servers.length) return Promise.resolve();
    starting ??= (async () => {
        const [{ default: IPCServer }, { default: WSServer }] = await Promise.all([
            import("arrpc/src/transports/ipc.js") as Promise<{ default: new (handlers: Handlers) => Promise<Closable> }>,
            import("arrpc/src/transports/websocket.js") as Promise<{ default: new (handlers: Handlers) => Promise<Closable> }>,
        ]);
        const h = handlers();
        const started = await Promise.allSettled([new IPCServer(h), new WSServer(h)]);
        servers = started.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    })().finally(() => {
        starting = null;
    });
    return starting;
}

export function stopRichPresence(): void {
    for (const server of servers) {
        try {
            server.server?.close();
            for (const client of server.wss?.clients ?? []) client.terminate();
            server.wss?.close();
            server.http?.close();
        } catch {
            // Already closed.
        }
    }
    servers = [];
    activities.clear();
}

export function isRichPresenceRunning(): boolean {
    return servers.length > 0;
}

// The newest activity an app set (several apps can be connected at once).
export function currentRpcActivities(): RpcActivity[] {
    return [...activities.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
