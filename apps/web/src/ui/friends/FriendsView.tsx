// SPDX-License-Identifier: AGPL-3.0-only
// Home → Friends, like Discord's: Online / All / Pending / Blocked, and Add Friend by Matrix ID. The list and requests
// live in core/friends/friends.ts.
import React, { useEffect, useMemo, useState } from "react";
import { ClientEvent, type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { FRIENDS_EVENT, friendAction, readFriends, type FriendAction, type FriendsList } from "../../core/friends/friends";
import { isValidMatrixUserId } from "../../core/dm/directChats";
import { thumbnailFromMxc } from "../adapters/media";
import { Avatar } from "../components/Avatar";
import { useIgnoredUsers } from "../hooks/useIgnoredUsers";
import { toAvatarPresenceState } from "../presence/buildPresenceVm";
import { usePresenceMap } from "../presence/usePresence";

export function useFriends(client: MatrixClient): FriendsList {
    const [list, setList] = useState<FriendsList>(() => readFriends(client));
    useEffect(() => {
        const onAccountData = (event: MatrixEvent): void => {
            if (event.getType() === FRIENDS_EVENT) setList(readFriends(client));
        };
        client.on(ClientEvent.AccountData, onAccountData);
        setList(readFriends(client));
        return () => {
            client.off(ClientEvent.AccountData, onAccountData);
        };
    }, [client]);
    return list;
}

// Runs a friend action with a toast; returns the DM's room ID.
export async function runFriendAction(
    client: MatrixClient,
    userId: string,
    action: FriendAction,
    onToast?: (toast: { type: "success" | "error" | "info"; message: string }) => void,
): Promise<string | null> {
    try {
        const roomId = await friendAction(client, userId, action);
        const done: Record<FriendAction, string> = {
            request: "Friend request sent.",
            accept: "You're now friends.",
            cancel: "Friend request cancelled.",
            remove: "Friend removed.",
        };
        onToast?.({ type: "success", message: done[action] });
        return roomId;
    } catch (error) {
        onToast?.({ type: "error", message: error instanceof Error ? error.message : "Couldn't do that." });
        return null;
    }
}

type Tab = "online" | "all" | "pending" | "blocked" | "add";

interface FriendsViewProps {
    client: MatrixClient;
    onOpenRoom: (roomId: string) => void;
    onCallUser?: (userId: string) => void;
    onToast?: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

export function FriendsView({ client, onOpenRoom, onCallUser, onToast }: FriendsViewProps): React.ReactElement {
    const list = useFriends(client);
    const { ignored, setIgnored } = useIgnoredUsers(client);
    const [tab, setTab] = useState<Tab>("online");
    const [search, setSearch] = useState("");
    const [addId, setAddId] = useState("");
    const people = useMemo(() => [...new Set([...list.friends, ...list.incoming, ...list.outgoing])], [list]);
    const presence = usePresenceMap(client, people, true);
    const pendingCount = list.incoming.length;

    const nameOf = (userId: string): string => client.getUser(userId)?.displayName ?? userId;
    const online = (userId: string): boolean => {
        const state = presence.get(userId)?.state;
        return state === "online" || state === "idle" || state === "dnd";
    };
    const matches = (userId: string): boolean => {
        const term = search.trim().toLowerCase();
        return !term || userId.toLowerCase().includes(term) || nameOf(userId).toLowerCase().includes(term);
    };
    const message = (userId: string): void => {
        void import("../../core/dm/directChats")
            .then(({ createOrReuseDirectChat }) => createOrReuseDirectChat(client, userId))
            .then((result) => onOpenRoom(result.roomId))
            .catch((error) => onToast?.({ type: "error", message: error instanceof Error ? error.message : "Couldn't open the chat." }));
    };

    const row = (userId: string, kind: "friend" | "incoming" | "outgoing" | "blocked"): React.ReactElement => {
        const user = client.getUser(userId);
        const vm = presence.get(userId) ?? null;
        return (
            <li key={`${kind}|${userId}`} className="friends-row" data-testid="friend-row" data-user-id={userId}>
                <Avatar
                    className="friends-row-avatar"
                    name={nameOf(userId)}
                    src={thumbnailFromMxc(client, user?.avatarUrl ?? null, 64, 64, "crop")}
                    seed={userId}
                    userId={userId}
                    presenceState={kind === "friend" && vm ? toAvatarPresenceState(vm) : null}
                />
                <span className="friends-row-main">
                    <strong>{nameOf(userId)}</strong>
                    <small>
                        {kind === "incoming"
                            ? "Incoming friend request"
                            : kind === "outgoing"
                              ? "Outgoing friend request"
                              : kind === "blocked"
                                ? "Blocked"
                                : (vm?.statusText ?? vm?.primaryLabel ?? userId)}
                    </small>
                </span>
                <span className="friends-row-actions">
                    {kind === "friend" ? (
                        <>
                            <button type="button" className="settings-button settings-button-secondary" onClick={() => message(userId)}>
                                Message
                            </button>
                            {onCallUser ? (
                                <button type="button" className="settings-button settings-button-secondary" onClick={() => onCallUser(userId)}>
                                    Call
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className="settings-button settings-button-danger"
                                onClick={() => {
                                    if (window.confirm(`Remove ${nameOf(userId)} as a friend?`)) void runFriendAction(client, userId, "remove", onToast);
                                }}
                            >
                                Remove
                            </button>
                        </>
                    ) : kind === "incoming" ? (
                        <>
                            <button type="button" className="settings-button" onClick={() => void runFriendAction(client, userId, "accept", onToast)} data-testid="friend-accept">
                                Accept
                            </button>
                            <button type="button" className="settings-button settings-button-secondary" onClick={() => void runFriendAction(client, userId, "cancel", onToast)}>
                                Ignore
                            </button>
                        </>
                    ) : kind === "outgoing" ? (
                        <button type="button" className="settings-button settings-button-secondary" onClick={() => void runFriendAction(client, userId, "cancel", onToast)}>
                            Cancel
                        </button>
                    ) : (
                        <button type="button" className="settings-button settings-button-secondary" onClick={() => void setIgnored(userId, false)}>
                            Unblock
                        </button>
                    )}
                </span>
            </li>
        );
    };

    const friendsShown = list.friends.filter((userId) => (tab === "online" ? online(userId) : true)).filter(matches);
    const validAdd = isValidMatrixUserId(addId.trim()) && addId.trim() !== client.getUserId();

    return (
        <section className="friends-view" data-testid="friends-view" aria-label="Friends">
            <header className="friends-header">
                <h2>Friends</h2>
                <nav className="friends-tabs" aria-label="Friends">
                    {(["online", "all", "pending", "blocked"] as const).map((item) => (
                        <button key={item} type="button" className={`friends-tab${tab === item ? " is-active" : ""}`} aria-pressed={tab === item} onClick={() => setTab(item)}>
                            {item === "online" ? "Online" : item === "all" ? "All" : item === "pending" ? "Pending" : "Blocked"}
                            {item === "pending" && pendingCount > 0 ? <span className="friends-badge">{pendingCount}</span> : null}
                        </button>
                    ))}
                    <button type="button" className={`friends-tab friends-tab-add${tab === "add" ? " is-active" : ""}`} aria-pressed={tab === "add"} onClick={() => setTab("add")}>
                        Add Friend
                    </button>
                </nav>
            </header>
            {tab === "add" ? (
                <form
                    className="friends-add"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!validAdd) return;
                        void runFriendAction(client, addId.trim(), "request", onToast).then((roomId) => {
                            if (roomId) setAddId("");
                        });
                    }}
                >
                    <h3>Add Friend</h3>
                    <p>Add a friend by their Matrix ID. They get a request in a direct message.</p>
                    <span className="friends-add-row">
                        <input value={addId} onChange={(event) => setAddId(event.target.value)} placeholder="@name:example.org" aria-label="Friend's Matrix ID" />
                        <button type="submit" className="settings-button" disabled={!validAdd}>
                            Send Friend Request
                        </button>
                    </span>
                </form>
            ) : (
                <>
                    <input type="search" className="friends-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search friends" />
                    {tab === "pending" ? (
                        <>
                            <h3 className="friends-count">Pending — {list.incoming.length + list.outgoing.length}</h3>
                            <ul className="friends-list">
                                {list.incoming.filter(matches).map((userId) => row(userId, "incoming"))}
                                {list.outgoing.filter(matches).map((userId) => row(userId, "outgoing"))}
                            </ul>
                        </>
                    ) : tab === "blocked" ? (
                        <>
                            <h3 className="friends-count">Blocked — {ignored.length}</h3>
                            <ul className="friends-list">{ignored.filter(matches).map((userId) => row(userId, "blocked"))}</ul>
                        </>
                    ) : (
                        <>
                            <h3 className="friends-count">
                                {tab === "online" ? "Online" : "All friends"} — {friendsShown.length}
                            </h3>
                            {friendsShown.length === 0 ? (
                                <p className="friends-empty">{list.friends.length === 0 ? "No friends yet. Add one with Add Friend." : "Nobody's online right now."}</p>
                            ) : (
                                <ul className="friends-list">{friendsShown.map((userId) => row(userId, "friend"))}</ul>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
}
