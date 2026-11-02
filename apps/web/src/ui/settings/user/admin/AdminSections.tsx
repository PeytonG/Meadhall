// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Server admin, the sections beyond tokens, accounts and notices (ServerAdminTab.tsx): a user's details
// (tabs like Synapse-Admin's user page), rooms, users' media, reported events, the room directory, federation, and an
// overview with maintenance tools. Everything goes through the Synapse Admin API (synapseAdminMore.ts).
import React, { useCallback, useEffect, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { generatePassword, sendServerNotice } from "../../../../core/admin/synapseAdmin";
import {
    backgroundUpdates,
    deleteDevice,
    deleteEventReport,
    deleteMedia,
    deleteRoom,
    downloadText,
    eraseUser,
    formatBytes,
    formatDate,
    getRateLimit,
    getUser,
    largestRooms,
    listConnections,
    listDestinationRooms,
    listDestinations,
    listDevices,
    listDirectory,
    listEventReports,
    listJoinedRooms,
    listMediaUsage,
    listPushers,
    listRoomMembers,
    listRooms,
    listUserMedia,
    makeRoomAdmin,
    purgeHistory,
    purgeRemoteMediaCache,
    reconnectDestination,
    reportedEventText,
    serverVersion,
    setInDirectory,
    setMediaQuarantined,
    setRateLimit,
    setRoomBlocked,
    setShadowBanned,
    toCsv,
    updateUser,
    type AdminDevice,
    type AdminMedia,
    type AdminRoom,
    type AdminUserDetails,
    type Connection,
    type Destination,
    type DirectoryRoom,
    type EventReport,
    type MediaUsage,
    type Pusher,
    type RateLimitOverride,
} from "../../../../core/admin/synapseAdminMore";

export interface AdminProps {
    client: MatrixClient;
    onToast: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

export function errorText(error: unknown): string {
    const data = (error as { data?: { error?: unknown } }).data;
    if (typeof data?.error === "string") return data.error;
    return error instanceof Error ? error.message : String(error);
}

// Loads something, with a reload function and an error shown in place.
function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; reload: () => void } {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);
    useEffect(() => {
        let cancelled = false;
        setError(null);
        load()
            .then((value) => {
                if (!cancelled) setData(value);
            })
            .catch((loadError) => {
                if (!cancelled) setError(errorText(loadError));
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, nonce]);
    return { data, error, reload: useCallback(() => setNonce((value) => value + 1), []) };
}

function Loading({ error }: { error: string | null }): React.ReactElement {
    return error ? <p className="settings-inline-error">{error}</p> : <p className="settings-tab-description">Loading…</p>;
}

function Table({ label, headers, children }: { label: string; headers: string[]; children: React.ReactNode }): React.ReactElement {
    return (
        <div className="admin-grid-wrap">
            <table className="admin-grid" aria-label={label}>
                <thead>
                    <tr>
                        {headers.map((header) => (
                            <th key={header}>{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

function Pager({ from, total, pageSize, onChange }: { from: number; total: number; pageSize: number; onChange: (from: number) => void }): React.ReactElement | null {
    if (total <= pageSize) return null;
    return (
        <div className="admin-pager">
            <span>
                {from + 1}–{Math.min(total, from + pageSize)} of {total}
            </span>
            <button type="button" className="settings-button settings-button-secondary" disabled={from === 0} onClick={() => onChange(Math.max(0, from - pageSize))}>
                Previous
            </button>
            <button type="button" className="settings-button settings-button-secondary" disabled={from + pageSize >= total} onClick={() => onChange(from + pageSize)}>
                Next
            </button>
        </div>
    );
}

const yes = (value: boolean): string => (value ? "✓" : "–");

// --- One user, with tabs like Synapse-Admin's user page ---

type UserTab = "user" | "contact" | "sso" | "devices" | "connections" | "media" | "rooms" | "pushers";
const USER_TABS: Array<{ id: UserTab; label: string }> = [
    { id: "user", label: "User" },
    { id: "contact", label: "Email / phone" },
    { id: "sso", label: "SSO" },
    { id: "devices", label: "Devices" },
    { id: "connections", label: "Connections" },
    { id: "media", label: "Media" },
    { id: "rooms", label: "Rooms" },
    { id: "pushers", label: "Pushers" },
];

export function UserDetail({ client, onToast, userId, onBack }: AdminProps & { userId: string; onBack: () => void }): React.ReactElement {
    const [tab, setTab] = useState<UserTab>("user");
    const user = useLoad(() => getUser(client, userId), [client, userId]);
    const [notice, setNotice] = useState<string | null>(null);

    const act = async (action: () => Promise<void>, done: string): Promise<void> => {
        try {
            await action();
            onToast({ type: "success", message: done });
            user.reload();
        } catch (error) {
            onToast({ type: "error", message: errorText(error) });
        }
    };

    return (
        <div className="settings-section-card" data-testid="admin-user-detail">
            <div className="admin-detail-header">
                <button type="button" className="settings-button settings-button-secondary" onClick={onBack}>
                    ← Users
                </button>
                <h3>{user.data?.displayname ? `${user.data.displayname} (${userId})` : userId}</h3>
                <span className="admin-detail-actions">
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => setNotice("")}>
                        Send server notice
                    </button>
                    {userId !== client.getUserId() ? (
                        <button
                            type="button"
                            className="settings-button settings-button-danger"
                            onClick={() => {
                                if (!window.confirm(`Erase ${userId}? The account is deactivated, its profile and media removed, and its messages hidden from people who join rooms later. This can't be undone.`)) return;
                                void act(() => eraseUser(client, userId), "Account erased.");
                            }}
                        >
                            Erase user data
                        </button>
                    ) : null}
                </span>
            </div>
            {notice !== null ? (
                <form
                    className="admin-inline-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void act(() => sendServerNotice(client, userId, notice), "Server notice sent.").then(() => setNotice(null));
                    }}
                >
                    <label className="settings-field">
                        Notice to {userId}
                        <textarea value={notice} onChange={(event) => setNotice(event.target.value)} rows={3} autoFocus />
                    </label>
                    <div className="settings-actions-row">
                        <button type="submit" className="settings-button" disabled={!notice.trim()}>
                            Send
                        </button>
                        <button type="button" className="settings-button settings-button-secondary" onClick={() => setNotice(null)}>
                            Cancel
                        </button>
                    </div>
                </form>
            ) : null}
            <div className="admin-subtabs" role="tablist" aria-label="User details">
                {USER_TABS.map((item) => (
                    <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`admin-subtab${tab === item.id ? " is-active" : ""}`} onClick={() => setTab(item.id)}>
                        {item.label}
                    </button>
                ))}
            </div>
            {!user.data ? (
                <Loading error={user.error} />
            ) : tab === "user" ? (
                <UserMainTab client={client} onToast={onToast} user={user.data} onSaved={user.reload} />
            ) : tab === "contact" ? (
                <ContactTab user={user.data} />
            ) : tab === "sso" ? (
                <Table label="SSO identities" headers={["Provider", "External ID"]}>
                    {user.data.external_ids.map((entry) => (
                        <tr key={`${entry.auth_provider}|${entry.external_id}`}>
                            <td>{entry.auth_provider}</td>
                            <td>{entry.external_id}</td>
                        </tr>
                    ))}
                </Table>
            ) : tab === "devices" ? (
                <DevicesTab client={client} onToast={onToast} userId={userId} />
            ) : tab === "connections" ? (
                <ConnectionsTab client={client} userId={userId} />
            ) : tab === "media" ? (
                <UserMediaTab client={client} onToast={onToast} userId={userId} />
            ) : tab === "rooms" ? (
                <JoinedRoomsTab client={client} userId={userId} />
            ) : (
                <PushersTab client={client} userId={userId} />
            )}
        </div>
    );
}

function UserMainTab({ client, onToast, user, onSaved }: AdminProps & { user: AdminUserDetails; onSaved: () => void }): React.ReactElement {
    const own = user.name === client.getUserId();
    const [displayname, setDisplayname] = useState(user.displayname ?? "");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [userType, setUserType] = useState(user.user_type ?? "");
    const [isAdmin, setIsAdmin] = useState(user.admin);
    const [locked, setLocked] = useState(user.locked);
    const [deactivated, setDeactivated] = useState(user.deactivated);
    const [busy, setBusy] = useState(false);
    const limit = useLoad(() => getRateLimit(client, user.name), [client, user.name]);
    const [rate, setRate] = useState<RateLimitOverride | null>(null);
    useEffect(() => setRate(limit.data ?? null), [limit.data]);

    const reactivating = user.deactivated && !deactivated;
    const save = async (): Promise<void> => {
        if (reactivating && password.length < 8) {
            onToast({ type: "error", message: "Reactivating an account needs a new password (at least 8 characters)." });
            return;
        }
        setBusy(true);
        try {
            await updateUser(client, user.name, {
                ...(displayname !== (user.displayname ?? "") ? { displayname } : {}),
                ...(password ? { password, logout_devices: true } : {}),
                ...(userType !== (user.user_type ?? "") ? { user_type: userType || null } : {}),
                ...(isAdmin !== user.admin ? { admin: isAdmin } : {}),
                ...(locked !== user.locked ? { locked } : {}),
                ...(deactivated !== user.deactivated ? { deactivated } : {}),
            });
            setPassword("");
            onToast({ type: "success", message: "Saved." });
            onSaved();
        } catch (error) {
            onToast({ type: "error", message: errorText(error) });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="admin-user-form" data-testid="admin-user-main">
            <label className="settings-field">
                User ID
                <input type="text" value={user.name} readOnly />
            </label>
            <label className="settings-field">
                Display name
                <input type="text" value={displayname} onChange={(event) => setDisplayname(event.target.value)} />
            </label>
            <label className="settings-field">
                New password
                <span className="admin-password-row">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => setShowPassword((value) => !value)}>
                        {showPassword ? "Hide" : "Show"}
                    </button>
                    <button
                        type="button"
                        className="settings-button settings-button-secondary"
                        onClick={() => {
                            setPassword(generatePassword());
                            setShowPassword(true);
                        }}
                    >
                        Generate
                    </button>
                </span>
                <small>Changing the password signs them out of every session.</small>
            </label>
            <label className="settings-field">
                User type
                <select value={userType} onChange={(event) => setUserType(event.target.value)}>
                    <option value="">Normal</option>
                    <option value="bot">Bot</option>
                    <option value="support">Support</option>
                </select>
            </label>
            <label className="settings-toggle">
                <input type="checkbox" checked={isAdmin} disabled={own} onChange={(event) => setIsAdmin(event.target.checked)} />
                Server administrator
            </label>
            <label className="settings-toggle">
                <input type="checkbox" checked={locked} disabled={own} onChange={(event) => setLocked(event.target.checked)} />
                Locked (can&apos;t use the account until unlocked; nothing is deleted)
            </label>
            <label className="settings-toggle">
                <input type="checkbox" checked={deactivated} disabled={own || user.erased} onChange={(event) => setDeactivated(event.target.checked)} />
                Deactivated {reactivating ? "(set a new password above to reactivate)" : ""}
            </label>
            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={user.shadow_banned}
                    disabled={own}
                    onChange={(event) => {
                        const banned = event.target.checked;
                        void setShadowBanned(client, user.name, banned)
                            .then(() => {
                                onToast({ type: "success", message: banned ? "Shadow-banned: what they send is silently dropped." : "Shadow ban lifted." });
                                onSaved();
                            })
                            .catch((error) => onToast({ type: "error", message: errorText(error) }));
                    }}
                />
                Shadow-banned (their messages look sent to them, but nobody else gets them)
            </label>
            <label className="settings-toggle">
                <input type="checkbox" checked={user.erased} disabled readOnly />
                Erased
            </label>
            <p className="settings-inline-note">
                Created {formatDate(user.creation_ts)}
                {user.is_guest ? " · Guest" : ""}
            </p>
            <div className="settings-actions-row">
                <button type="button" className="settings-button" onClick={() => void save()} disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                </button>
            </div>

            <fieldset className="settings-fieldset">
                <legend>Rate limit</legend>
                <label className="settings-toggle">
                    <input
                        type="checkbox"
                        checked={rate !== null}
                        onChange={(event) => setRate(event.target.checked ? { messages_per_second: 0, burst_count: 0 } : null)}
                    />
                    Override the server&apos;s rate limit for this account (0 and 0 = no limit, e.g. for bots)
                </label>
                {rate ? (
                    <span className="admin-form-row">
                        <label className="settings-field">
                            Messages per second
                            <input type="number" min={0} value={rate.messages_per_second} onChange={(event) => setRate({ ...rate, messages_per_second: Number(event.target.value) })} />
                        </label>
                        <label className="settings-field">
                            Burst
                            <input type="number" min={0} value={rate.burst_count} onChange={(event) => setRate({ ...rate, burst_count: Number(event.target.value) })} />
                        </label>
                    </span>
                ) : null}
                <button
                    type="button"
                    className="settings-button settings-button-secondary"
                    onClick={() =>
                        void setRateLimit(client, user.name, rate)
                            .then(() => {
                                onToast({ type: "success", message: "Rate limit saved." });
                                limit.reload();
                            })
                            .catch((error) => onToast({ type: "error", message: errorText(error) }))
                    }
                >
                    Save rate limit
                </button>
            </fieldset>
        </div>
    );
}

function ContactTab({ user }: { user: AdminUserDetails }): React.ReactElement {
    return user.threepids.length === 0 ? (
        <p className="settings-tab-description">No email addresses or phone numbers.</p>
    ) : (
        <Table label="Email and phone" headers={["Type", "Address", "Added", "Validated"]}>
            {user.threepids.map((entry) => (
                <tr key={`${entry.medium}|${entry.address}`}>
                    <td>{entry.medium === "msisdn" ? "Phone" : "Email"}</td>
                    <td>{entry.address}</td>
                    <td>{formatDate(entry.added_at)}</td>
                    <td>{formatDate(entry.validated_at)}</td>
                </tr>
            ))}
        </Table>
    );
}

function DevicesTab({ client, onToast, userId }: AdminProps & { userId: string }): React.ReactElement {
    const devices = useLoad<AdminDevice[]>(() => listDevices(client, userId), [client, userId]);
    if (!devices.data) return <Loading error={devices.error} />;
    return (
        <Table label="Devices" headers={["Device", "Name", "Last seen", "IP", ""]}>
            {devices.data.map((device) => (
                <tr key={device.device_id}>
                    <td>
                        <code>{device.device_id}</code>
                    </td>
                    <td>{device.display_name ?? ""}</td>
                    <td>{formatDate(device.last_seen_ts)}</td>
                    <td>{device.last_seen_ip ?? ""}</td>
                    <td>
                        {device.device_id !== client.getDeviceId() ? (
                            <button
                                type="button"
                                className="settings-button settings-button-danger"
                                onClick={() => {
                                    if (!window.confirm(`Sign ${userId} out of ${device.display_name ?? device.device_id}?`)) return;
                                    void deleteDevice(client, userId, device.device_id)
                                        .then(() => {
                                            onToast({ type: "success", message: "Device signed out." });
                                            devices.reload();
                                        })
                                        .catch((error) => onToast({ type: "error", message: errorText(error) }));
                                }}
                            >
                                Sign out
                            </button>
                        ) : null}
                    </td>
                </tr>
            ))}
        </Table>
    );
}

function ConnectionsTab({ client, userId }: { client: MatrixClient; userId: string }): React.ReactElement {
    const connections = useLoad<Connection[]>(() => listConnections(client, userId), [client, userId]);
    if (!connections.data) return <Loading error={connections.error} />;
    return (
        <Table label="Connections" headers={["IP", "Last seen", "Device", "App"]}>
            {connections.data.map((connection, index) => (
                <tr key={`${connection.device}|${connection.ip}|${index}`}>
                    <td>{connection.ip}</td>
                    <td>{formatDate(connection.last_seen)}</td>
                    <td>
                        <code>{connection.device}</code>
                    </td>
                    <td className="admin-cell-wrap">{connection.user_agent}</td>
                </tr>
            ))}
        </Table>
    );
}

function MediaRows({ client, onToast, media, onChanged }: AdminProps & { media: AdminMedia[]; onChanged: () => void }): React.ReactElement {
    const act = (action: () => Promise<void>, done: string): void =>
        void action()
            .then(() => {
                onToast({ type: "success", message: done });
                onChanged();
            })
            .catch((error) => onToast({ type: "error", message: errorText(error) }));
    return (
        <Table label="Media" headers={["File", "Type", "Size", "Uploaded", "Quarantined", ""]}>
            {media.map((item) => (
                <tr key={item.media_id}>
                    <td className="admin-cell-wrap">{item.upload_name ?? item.media_id}</td>
                    <td>{item.media_type ?? ""}</td>
                    <td>{formatBytes(item.media_length)}</td>
                    <td>{formatDate(item.created_ts)}</td>
                    <td>{yes(Boolean(item.quarantined_by))}</td>
                    <td className="admin-cell-actions">
                        <button type="button" className="settings-button settings-button-secondary" onClick={() => act(() => setMediaQuarantined(client, item.media_id, !item.quarantined_by), item.quarantined_by ? "Released." : "Quarantined.")}>
                            {item.quarantined_by ? "Release" : "Quarantine"}
                        </button>
                        <button
                            type="button"
                            className="settings-button settings-button-danger"
                            onClick={() => {
                                if (window.confirm("Delete this file for everyone?")) act(() => deleteMedia(client, item.media_id), "File deleted.");
                            }}
                        >
                            Delete
                        </button>
                    </td>
                </tr>
            ))}
        </Table>
    );
}

function UserMediaTab({ client, onToast, userId }: AdminProps & { userId: string }): React.ReactElement {
    const [from, setFrom] = useState(0);
    const media = useLoad(() => listUserMedia(client, userId, from, 50), [client, userId, from]);
    if (!media.data) return <Loading error={media.error} />;
    return (
        <>
            {media.data.media.length === 0 ? <p className="settings-tab-description">No uploads.</p> : <MediaRows client={client} onToast={onToast} media={media.data.media} onChanged={media.reload} />}
            <Pager from={from} total={media.data.total} pageSize={50} onChange={setFrom} />
        </>
    );
}

function JoinedRoomsTab({ client, userId }: { client: MatrixClient; userId: string }): React.ReactElement {
    const rooms = useLoad(() => listJoinedRooms(client, userId), [client, userId]);
    if (!rooms.data) return <Loading error={rooms.error} />;
    return (
        <Table label="Rooms" headers={["Room", "Name"]}>
            {rooms.data.map((roomId) => (
                <tr key={roomId}>
                    <td>
                        <code>{roomId}</code>
                    </td>
                    <td>{client.getRoom(roomId)?.name ?? ""}</td>
                </tr>
            ))}
        </Table>
    );
}

function PushersTab({ client, userId }: { client: MatrixClient; userId: string }): React.ReactElement {
    const pushers = useLoad<Pusher[]>(() => listPushers(client, userId), [client, userId]);
    if (!pushers.data) return <Loading error={pushers.error} />;
    if (pushers.data.length === 0) return <p className="settings-tab-description">No push notification targets.</p>;
    return (
        <Table label="Pushers" headers={["App", "Device", "Kind", "Gateway"]}>
            {pushers.data.map((pusher) => (
                <tr key={pusher.pushkey}>
                    <td>{pusher.app_display_name}</td>
                    <td>{pusher.device_display_name}</td>
                    <td>{pusher.kind}</td>
                    <td className="admin-cell-wrap">{pusher.data?.url ?? ""}</td>
                </tr>
            ))}
        </Table>
    );
}

// --- Rooms ---

export function RoomsSection({ client, onToast }: AdminProps): React.ReactElement {
    const [search, setSearch] = useState("");
    const [from, setFrom] = useState(0);
    const [query, setQuery] = useState("");
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setQuery(search);
            setFrom(0);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [search]);
    const rooms = useLoad(() => listRooms(client, { search: query, from, limit: 50 }), [client, query, from]);
    const [open, setOpen] = useState<AdminRoom | null>(null);

    if (open) return <RoomDetail client={client} onToast={onToast} room={open} onBack={() => (setOpen(null), rooms.reload())} />;
    return (
        <div className="settings-section-card" data-testid="admin-rooms">
            <h3>Rooms</h3>
            <div className="admin-toolbar">
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, alias or ID" aria-label="Search rooms" />
                {rooms.data ? (
                    <button
                        type="button"
                        className="settings-button settings-button-secondary"
                        onClick={() => downloadText("rooms.csv", toCsv(rooms.data!.rooms.map((room) => ({ ...room }))))}
                    >
                        Export
                    </button>
                ) : null}
            </div>
            {!rooms.data ? (
                <Loading error={rooms.error} />
            ) : (
                <>
                    <Table label="Rooms" headers={["Name", "Members", "Local", "Encrypted", "Public", "Federated", "Version"]}>
                        {rooms.data.rooms.map((room) => (
                            <tr key={room.room_id} className="admin-clickable" onClick={() => setOpen(room)}>
                                <td>
                                    <strong>{room.name ?? room.canonical_alias ?? "(no name)"}</strong>
                                    <br />
                                    <small>
                                        <code>{room.room_id}</code>
                                        {room.room_type === "m.space" ? " · space" : ""}
                                    </small>
                                </td>
                                <td>{room.joined_members}</td>
                                <td>{room.joined_local_members}</td>
                                <td>{yes(Boolean(room.encryption))}</td>
                                <td>{yes(room.public)}</td>
                                <td>{yes(room.federatable)}</td>
                                <td>{room.version}</td>
                            </tr>
                        ))}
                    </Table>
                    <Pager from={from} total={rooms.data.total} pageSize={50} onChange={setFrom} />
                </>
            )}
        </div>
    );
}

function RoomDetail({ client, onToast, room, onBack }: AdminProps & { room: AdminRoom; onBack: () => void }): React.ReactElement {
    const members = useLoad(() => listRoomMembers(client, room.room_id), [client, room.room_id]);
    const [message, setMessage] = useState("");
    const [block, setBlock] = useState(true);
    const [purgeDays, setPurgeDays] = useState("90");
    const act = (action: () => Promise<unknown>, done: string): void =>
        void action()
            .then(() => onToast({ type: "success", message: done }))
            .catch((error) => onToast({ type: "error", message: errorText(error) }));
    return (
        <div className="settings-section-card" data-testid="admin-room-detail">
            <div className="admin-detail-header">
                <button type="button" className="settings-button settings-button-secondary" onClick={onBack}>
                    ← Rooms
                </button>
                <h3>{room.name ?? room.canonical_alias ?? room.room_id}</h3>
            </div>
            <dl className="admin-facts">
                <dt>Room ID</dt>
                <dd>
                    <code>{room.room_id}</code>
                </dd>
                <dt>Alias</dt>
                <dd>{room.canonical_alias ?? "–"}</dd>
                <dt>Creator</dt>
                <dd>{room.creator ?? "–"}</dd>
                <dt>Members</dt>
                <dd>
                    {room.joined_members} ({room.joined_local_members} from this server)
                </dd>
                <dt>Join rule</dt>
                <dd>{room.join_rules ?? "–"}</dd>
                <dt>Encryption</dt>
                <dd>{room.encryption ?? "none"}</dd>
                <dt>Version</dt>
                <dd>{room.version}</dd>
                <dt>State events</dt>
                <dd>{room.state_events}</dd>
            </dl>
            <div className="settings-actions-row">
                <button type="button" className="settings-button settings-button-secondary" onClick={() => act(() => makeRoomAdmin(client, room.room_id, client.getSafeUserId()), "You're now an admin of this room.")}>
                    Make me room admin
                </button>
                <button type="button" className="settings-button settings-button-secondary" onClick={() => act(() => setRoomBlocked(client, room.room_id, true), "Room blocked: nobody here can join it.")}>
                    Block
                </button>
                <button type="button" className="settings-button settings-button-secondary" onClick={() => act(() => setRoomBlocked(client, room.room_id, false), "Room unblocked.")}>
                    Unblock
                </button>
            </div>
            <fieldset className="settings-fieldset">
                <legend>Purge old history</legend>
                <label className="settings-field">
                    Remove messages older than (days)
                    <input type="number" min={1} value={purgeDays} onChange={(event) => setPurgeDays(event.target.value)} />
                </label>
                <button
                    type="button"
                    className="settings-button settings-button-danger"
                    onClick={() => {
                        const days = Math.max(1, Number(purgeDays) || 0);
                        if (window.confirm(`Remove this room's messages older than ${days} days from this server? Other servers keep their copies.`)) {
                            act(() => purgeHistory(client, room.room_id, Date.now() - days * 86_400_000), "Purge started.");
                        }
                    }}
                >
                    Purge history
                </button>
            </fieldset>
            <fieldset className="settings-fieldset">
                <legend>Delete room</legend>
                <label className="settings-field">
                    Message for the members (optional: they&apos;re moved to a new room with it)
                    <input type="text" value={message} onChange={(event) => setMessage(event.target.value)} />
                </label>
                <label className="settings-toggle">
                    <input type="checkbox" checked={block} onChange={(event) => setBlock(event.target.checked)} />
                    Block it, so nobody on this server can join it again
                </label>
                <button
                    type="button"
                    className="settings-button settings-button-danger"
                    onClick={() => {
                        if (!window.confirm("Delete this room? Everyone on this server is removed from it and its data is purged.")) return;
                        act(() => deleteRoom(client, room.room_id, { block, purge: true, message: message.trim() || undefined }), "Room deletion started.");
                    }}
                >
                    Delete room
                </button>
            </fieldset>
            <h4>Members</h4>
            {!members.data ? (
                <Loading error={members.error} />
            ) : (
                <ul className="admin-plain-list">
                    {members.data.map((member) => (
                        <li key={member}>{member}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// --- Users' media ---

export function MediaSection({ client, onToast }: AdminProps): React.ReactElement {
    const [from, setFrom] = useState(0);
    const usage = useLoad(() => listMediaUsage(client, from, 50), [client, from]);
    const [days, setDays] = useState("30");
    const [user, setUser] = useState<MediaUsage | null>(null);
    if (user) {
        return (
            <div className="settings-section-card">
                <div className="admin-detail-header">
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => setUser(null)}>
                        ← Users&apos; media
                    </button>
                    <h3>{user.displayname ?? user.user_id}</h3>
                </div>
                <UserMediaTab client={client} onToast={onToast} userId={user.user_id} />
            </div>
        );
    }
    return (
        <div className="settings-section-card" data-testid="admin-media">
            <h3>Users&apos; media</h3>
            <div className="admin-toolbar">
                <label className="settings-field">
                    Drop cached media from other servers older than (days)
                    <input type="number" min={1} value={days} onChange={(event) => setDays(event.target.value)} />
                </label>
                <button
                    type="button"
                    className="settings-button settings-button-secondary"
                    onClick={() =>
                        void purgeRemoteMediaCache(client, Math.max(1, Number(days) || 30))
                            .then((deleted) => onToast({ type: "success", message: `Removed ${deleted} cached file${deleted === 1 ? "" : "s"}.` }))
                            .catch((error) => onToast({ type: "error", message: errorText(error) }))
                    }
                >
                    Purge remote cache
                </button>
            </div>
            {!usage.data ? (
                <Loading error={usage.error} />
            ) : (
                <>
                    <Table label="Users' media" headers={["User", "Files", "Size"]}>
                        {usage.data.users.map((entry) => (
                            <tr key={entry.user_id} className="admin-clickable" onClick={() => setUser(entry)}>
                                <td>
                                    {entry.displayname ? <strong>{entry.displayname} </strong> : null}
                                    <small>{entry.user_id}</small>
                                </td>
                                <td>{entry.media_count}</td>
                                <td>{formatBytes(entry.media_length)}</td>
                            </tr>
                        ))}
                    </Table>
                    <Pager from={from} total={usage.data.total} pageSize={50} onChange={setFrom} />
                </>
            )}
        </div>
    );
}

// --- Reported events ---

export function ReportedEventsSection({ client, onToast }: AdminProps): React.ReactElement {
    const [from, setFrom] = useState(0);
    const reports = useLoad(() => listEventReports(client, from, 50), [client, from]);
    const [texts, setTexts] = useState<Record<number, string | null>>({});
    return (
        <div className="settings-section-card" data-testid="admin-event-reports">
            <h3>Reported events</h3>
            <p className="settings-tab-description">
                Messages people reported to this homeserver (from any Matrix app). Reports inside a space go to its moderators
                instead (Space Settings → Reports).
            </p>
            {!reports.data ? (
                <Loading error={reports.error} />
            ) : reports.data.reports.length === 0 ? (
                <p className="settings-tab-description">No reports.</p>
            ) : (
                <>
                    <Table label="Reported events" headers={["When", "Room", "Sender", "Reported by", "Reason", ""]}>
                        {reports.data.reports.map((report: EventReport) => (
                            <React.Fragment key={report.id}>
                                <tr>
                                    <td>{formatDate(report.received_ts)}</td>
                                    <td>{report.name ?? <code>{report.room_id}</code>}</td>
                                    <td>{report.sender ?? ""}</td>
                                    <td>{report.user_id}</td>
                                    <td className="admin-cell-wrap">{report.reason ?? ""}</td>
                                    <td className="admin-cell-actions">
                                        <button
                                            type="button"
                                            className="settings-button settings-button-secondary"
                                            onClick={() =>
                                                void reportedEventText(client, report.id)
                                                    .then((text) => setTexts((current) => ({ ...current, [report.id]: text })))
                                                    .catch((error) => onToast({ type: "error", message: errorText(error) }))
                                            }
                                        >
                                            Show message
                                        </button>
                                        <button
                                            type="button"
                                            className="settings-button settings-button-secondary"
                                            onClick={() =>
                                                void deleteEventReport(client, report.id)
                                                    .then(() => {
                                                        onToast({ type: "success", message: "Report closed." });
                                                        reports.reload();
                                                    })
                                                    .catch((error) => onToast({ type: "error", message: errorText(error) }))
                                            }
                                        >
                                            Close
                                        </button>
                                    </td>
                                </tr>
                                {report.id in texts ? (
                                    <tr>
                                        <td colSpan={6} className="admin-cell-wrap">
                                            {texts[report.id] ?? "(not readable here: encrypted, or not a text message)"}
                                        </td>
                                    </tr>
                                ) : null}
                            </React.Fragment>
                        ))}
                    </Table>
                    <Pager from={from} total={reports.data.total} pageSize={50} onChange={setFrom} />
                </>
            )}
        </div>
    );
}

// --- Room directory ---

export function DirectorySection({ client, onToast }: AdminProps): React.ReactElement {
    const rooms = useLoad<DirectoryRoom[]>(() => listDirectory(client), [client]);
    const [roomId, setRoomId] = useState("");
    const change = (id: string, listed: boolean): void =>
        void setInDirectory(client, id, listed)
            .then(() => {
                onToast({ type: "success", message: listed ? "Listed in the room directory." : "Removed from the room directory." });
                rooms.reload();
            })
            .catch((error) =>
                onToast({
                    type: "error",
                    message:
                        listed && (error as { httpStatus?: number }).httpStatus === 403
                            ? "This homeserver doesn't allow publishing that room. Allow it with room_list_publication_rules in homeserver.yaml."
                            : errorText(error),
                }),
            );
    return (
        <div className="settings-section-card" data-testid="admin-directory">
            <h3>Room directory</h3>
            <p className="settings-tab-description">The public rooms people can find when they browse this server.</p>
            <form
                className="admin-toolbar"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (roomId.trim()) change(roomId.trim(), true);
                    setRoomId("");
                }}
            >
                <input type="text" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="!roomid:server" aria-label="Room ID to list" />
                <button type="submit" className="settings-button settings-button-secondary" disabled={!roomId.trim()}>
                    Add to directory
                </button>
            </form>
            {!rooms.data ? (
                <Loading error={rooms.error} />
            ) : (
                <Table label="Room directory" headers={["Room", "Members", "Topic", ""]}>
                    {rooms.data.map((room) => (
                        <tr key={room.room_id}>
                            <td>
                                <strong>{room.name ?? room.canonical_alias ?? room.room_id}</strong>
                                <br />
                                <small>{room.canonical_alias ?? room.room_id}</small>
                            </td>
                            <td>{room.num_joined_members}</td>
                            <td className="admin-cell-wrap">{room.topic ?? ""}</td>
                            <td>
                                <button type="button" className="settings-button settings-button-secondary" onClick={() => change(room.room_id, false)}>
                                    Remove
                                </button>
                            </td>
                        </tr>
                    ))}
                </Table>
            )}
        </div>
    );
}

// --- Federation ---

function retryText(ms: number): string {
    if (!ms) return "0";
    const hours = ms / 3_600_000;
    return hours >= 24 ? `${(hours / 24).toFixed(1)} days` : hours >= 1 ? `${hours.toFixed(1)} h` : `${Math.round(ms / 60_000)} min`;
}

export function FederationSection({ client, onToast }: AdminProps): React.ReactElement {
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [from, setFrom] = useState(0);
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setQuery(search);
            setFrom(0);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [search]);
    const destinations = useLoad(() => listDestinations(client, { search: query, from, limit: 50 }), [client, query, from]);
    const [open, setOpen] = useState<Destination | null>(null);
    const reconnect = (destination: string): void =>
        void reconnectDestination(client, destination)
            .then(() => {
                onToast({ type: "success", message: `Trying ${destination} again now.` });
                destinations.reload();
            })
            .catch((error) => onToast({ type: "error", message: errorText(error) }));

    if (open) return <DestinationDetail client={client} destination={open} onReconnect={() => reconnect(open.destination)} onBack={() => setOpen(null)} />;
    return (
        <div className="settings-section-card" data-testid="admin-federation">
            <h3>Federation</h3>
            <p className="settings-tab-description">Other homeservers this one talks to. Red rows are failing: Synapse waits longer between each retry.</p>
            <div className="admin-toolbar">
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search servers" aria-label="Search servers" />
                {destinations.data ? (
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => downloadText("federation.csv", toCsv(destinations.data!.destinations.map((item) => ({ ...item }))))}>
                        Export
                    </button>
                ) : null}
            </div>
            {!destinations.data ? (
                <Loading error={destinations.error} />
            ) : (
                <>
                    <Table label="Federation" headers={["Server", "Failing since", "Last retry", "Retry interval", "Last successful stream", ""]}>
                        {destinations.data.destinations.map((item) => (
                            <tr key={item.destination} className={`admin-clickable${item.failure_ts ? " is-failing" : ""}`} onClick={() => setOpen(item)}>
                                <td>{item.destination}</td>
                                <td>{formatDate(item.failure_ts)}</td>
                                <td>{formatDate(item.retry_last_ts)}</td>
                                <td>{retryText(item.retry_interval)}</td>
                                <td>{item.last_successful_stream_ordering ?? ""}</td>
                                <td>
                                    {item.failure_ts || item.retry_interval ? (
                                        <button
                                            type="button"
                                            className="settings-button settings-button-secondary"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                reconnect(item.destination);
                                            }}
                                        >
                                            Reconnect
                                        </button>
                                    ) : null}
                                </td>
                            </tr>
                        ))}
                    </Table>
                    <Pager from={from} total={destinations.data.total} pageSize={50} onChange={setFrom} />
                </>
            )}
        </div>
    );
}

function DestinationDetail({ client, destination, onReconnect, onBack }: { client: MatrixClient; destination: Destination; onReconnect: () => void; onBack: () => void }): React.ReactElement {
    const [tab, setTab] = useState<"status" | "rooms">("status");
    const rooms = useLoad(() => listDestinationRooms(client, destination.destination), [client, destination.destination]);
    return (
        <div className="settings-section-card" data-testid="admin-destination">
            <div className="admin-detail-header">
                <button type="button" className="settings-button settings-button-secondary" onClick={onBack}>
                    ← Federation
                </button>
                <h3>{destination.destination}</h3>
                <span className="admin-detail-actions">
                    <button type="button" className="settings-button settings-button-secondary" onClick={onReconnect}>
                        Reconnect
                    </button>
                </span>
            </div>
            <div className="admin-subtabs" role="tablist" aria-label="Server details">
                {(["status", "rooms"] as const).map((item) => (
                    <button key={item} type="button" role="tab" aria-selected={tab === item} className={`admin-subtab${tab === item ? " is-active" : ""}`} onClick={() => setTab(item)}>
                        {item === "status" ? "Status" : "Rooms"}
                    </button>
                ))}
            </div>
            {tab === "status" ? (
                <dl className="admin-facts">
                    <dt>Server</dt>
                    <dd>{destination.destination}</dd>
                    <dt>Failing since</dt>
                    <dd>{formatDate(destination.failure_ts) || "Not failing"}</dd>
                    <dt>Last retry</dt>
                    <dd>{formatDate(destination.retry_last_ts) || "–"}</dd>
                    <dt>Retry interval</dt>
                    <dd>{retryText(destination.retry_interval)}</dd>
                    <dt>Last successful stream</dt>
                    <dd>{destination.last_successful_stream_ordering ?? "–"}</dd>
                </dl>
            ) : !rooms.data ? (
                <Loading error={rooms.error} />
            ) : (
                <Table label="Shared rooms" headers={["Room", "Name", "Stream ordering"]}>
                    {rooms.data.map((room) => (
                        <tr key={room.room_id}>
                            <td>
                                <code>{room.room_id}</code>
                            </td>
                            <td>{client.getRoom(room.room_id)?.name ?? ""}</td>
                            <td>{room.stream_ordering}</td>
                        </tr>
                    ))}
                </Table>
            )}
        </div>
    );
}

// --- Overview ---

export function OverviewSection({ client }: AdminProps): React.ReactElement {
    const info = useLoad(
        async () => {
            const [version, updates, largest, rooms] = await Promise.all([
                serverVersion(client),
                backgroundUpdates(client).catch(() => null),
                largestRooms(client).catch(() => []),
                listRooms(client, { limit: 1 }).catch(() => null),
            ]);
            return { version, updates, largest: largest.slice(0, 10), roomCount: rooms?.total ?? null };
        },
        [client],
    );
    return (
        <div className="settings-section-card" data-testid="admin-overview">
            <h3>Overview</h3>
            {!info.data ? (
                <Loading error={info.error} />
            ) : (
                <>
                    <dl className="admin-facts">
                        <dt>Server</dt>
                        <dd>{client.getDomain()}</dd>
                        <dt>Synapse</dt>
                        <dd>{info.data.version}</dd>
                        <dt>Rooms</dt>
                        <dd>{info.data.roomCount ?? "–"}</dd>
                        <dt>Database maintenance</dt>
                        <dd>{info.data.updates ? (info.data.updates.running.length ? `Running: ${info.data.updates.running.join(", ")}` : "Nothing running") : "–"}</dd>
                    </dl>
                    {info.data.largest.length ? (
                        <>
                            <h4>Largest rooms in the database</h4>
                            <Table label="Largest rooms" headers={["Room", "Size"]}>
                                {info.data.largest.map((room) => (
                                    <tr key={room.room_id}>
                                        <td>{client.getRoom(room.room_id)?.name ?? <code>{room.room_id}</code>}</td>
                                        <td>{formatBytes(room.estimated_size)}</td>
                                    </tr>
                                ))}
                            </Table>
                        </>
                    ) : null}
                </>
            )}
        </div>
    );
}
