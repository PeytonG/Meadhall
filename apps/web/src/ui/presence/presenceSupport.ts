// SPDX-License-Identifier: AGPL-3.0-only
// Which homeservers share presence with us. Some servers (matrix.org among them) turn presence off, so their users
// never send a status: rather than showing them as always offline, they get a "?" ("status unavailable").
//
// A server counts as sharing presence once we've received presence for anyone on it (any state, ever). Until the
// first sync has finished we don't know yet, and our own server always counts.
import { ClientEvent, UserEvent, type MatrixClient, type User } from "matrix-js-sdk/src/matrix";

const trackers = new WeakMap<MatrixClient, Set<string>>();

export function serverOf(userId: string): string {
    const colon = userId.indexOf(":");
    return colon === -1 ? "" : userId.slice(colon + 1);
}

function tracker(client: MatrixClient): Set<string> {
    let servers = trackers.get(client);
    if (servers) return servers;
    const known = new Set<string>();
    servers = known;
    trackers.set(client, known);
    const note = (user: User | undefined): void => {
        if (user?.userId && user.events.presence) known.add(serverOf(user.userId));
    };
    for (const user of client.getUsers()) note(user);
    client.on(UserEvent.Presence, (_event, user) => note(user));
    // Users known before the listener existed (the initial sync).
    client.on(ClientEvent.Sync, () => {
        for (const user of client.getUsers()) note(user);
    });
    return known;
}

export function serverSharesPresence(client: MatrixClient, userId: string): boolean {
    const server = serverOf(userId);
    if (!server || server === client.getDomain()) return true;
    const known = tracker(client);
    if (known.has(server)) return true;
    // Before the first sync is done, nothing has arrived from anyone yet.
    return !client.isInitialSyncComplete();
}
