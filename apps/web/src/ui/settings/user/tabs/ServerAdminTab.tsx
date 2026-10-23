// SPDX-License-Identifier: AGPL-3.0-only
// Settings -> Server admin (server admins only): what the Synapse admin page is used for, inside Meadhall.
// Registration tokens (invite codes for sign-up) and user management: create accounts, reset passwords,
// make admins, deactivate. Every action goes through the Synapse Admin API, which rejects non-admins.
import React, { useCallback, useEffect, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import {
    createRegistrationToken,
    createUserAccount,
    deactivateUser,
    deleteRegistrationToken,
    generatePassword,
    isServerAdmin,
    listRegistrationTokens,
    listUsers,
    resetUserPassword,
    setUserAdmin,
    type AdminUser,
    type RegistrationToken,
} from "../../../../core/admin/synapseAdmin";
import { thumbnailFromMxc } from "../../../adapters/media";
import { Avatar } from "../../../components/Avatar";

interface ServerAdminTabProps {
    client: MatrixClient;
    onToast: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

function errorText(error: unknown): string {
    const data = (error as { data?: { error?: unknown } }).data;
    if (typeof data?.error === "string") return data.error;
    return error instanceof Error ? error.message : String(error);
}

async function copy(text: string): Promise<void> {
    await navigator.clipboard?.writeText(text);
}

function formatExpiry(expiry: number | null): string {
    if (!expiry) return "Never";
    return expiry < Date.now() ? "Expired" : new Date(expiry).toLocaleDateString();
}

function TokensSection({ client, onToast }: ServerAdminTabProps): React.ReactElement {
    const [tokens, setTokens] = useState<RegistrationToken[] | null>(null);
    const [uses, setUses] = useState("1");
    const [days, setDays] = useState("7");
    const [custom, setCustom] = useState("");
    const [busy, setBusy] = useState(false);
    const [created, setCreated] = useState<string | null>(null);

    const reload = useCallback(async () => {
        try {
            setTokens(await listRegistrationTokens(client));
        } catch (error) {
            onToast({ type: "error", message: `Couldn't load tokens: ${errorText(error)}` });
        }
    }, [client, onToast]);
    useEffect(() => void reload(), [reload]);

    const create = async (): Promise<void> => {
        setBusy(true);
        try {
            const usesAllowed = uses.trim() ? Math.max(1, Number(uses)) : null;
            const expiresInDays = days.trim() ? Math.max(1, Number(days)) : null;
            const token = await createRegistrationToken(client, { usesAllowed, expiresInDays, token: custom });
            setCreated(token.token);
            setCustom("");
            await reload();
        } catch (error) {
            onToast({ type: "error", message: `Couldn't create the token: ${errorText(error)}` });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="settings-section-card" data-testid="admin-tokens">
            <h3>Registration tokens</h3>
            <p className="settings-tab-description">Invite codes people enter on the Register screen to create an account.</p>
            <div className="admin-form-row">
                <label className="settings-field">
                    Uses (blank = unlimited)
                    <input type="number" min={1} value={uses} onChange={(event) => setUses(event.target.value)} />
                </label>
                <label className="settings-field">
                    Expires after days (blank = never)
                    <input type="number" min={1} value={days} onChange={(event) => setDays(event.target.value)} />
                </label>
                <label className="settings-field">
                    Custom token (optional)
                    <input type="text" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Random if blank" />
                </label>
                <button type="button" className="settings-button" disabled={busy} onClick={() => void create()}>
                    Create token
                </button>
            </div>
            {created ? (
                <div className="admin-created" role="status">
                    New token: <code data-testid="admin-new-token">{created}</code>
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => void copy(created).then(() => onToast({ type: "success", message: "Token copied." }))}>
                        Copy
                    </button>
                </div>
            ) : null}
            <div className="admin-table" role="table" aria-label="Registration tokens">
                {tokens === null ? (
                    <p className="settings-tab-description">Loading...</p>
                ) : tokens.length === 0 ? (
                    <p className="settings-tab-description">No tokens yet.</p>
                ) : (
                    tokens.map((token) => (
                        <div key={token.token} className="admin-row" role="row">
                            <code className="admin-row-main">{token.token}</code>
                            <span className="admin-row-meta">
                                Used {token.completed}
                                {token.uses_allowed !== null ? ` of ${token.uses_allowed}` : ""} · Expires {formatExpiry(token.expiry_time)}
                            </span>
                            <button type="button" className="settings-button settings-button-secondary" onClick={() => void copy(token.token).then(() => onToast({ type: "success", message: "Token copied." }))}>
                                Copy
                            </button>
                            <button
                                type="button"
                                className="settings-button settings-button-danger"
                                onClick={() => {
                                    if (!window.confirm(`Delete token ${token.token}? It stops working immediately.`)) return;
                                    void deleteRegistrationToken(client, token.token)
                                        .then(reload)
                                        .catch((error) => onToast({ type: "error", message: errorText(error) }));
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function UsersSection({ client, onToast }: ServerAdminTabProps): React.ReactElement {
    const [search, setSearch] = useState("");
    const [users, setUsers] = useState<AdminUser[] | null>(null);
    const [newUser, setNewUser] = useState({ username: "", displayName: "", password: generatePassword() });
    const [reveal, setReveal] = useState<{ userId: string; password: string } | null>(null);
    // The password reset form open under one user (an in-page form: the desktop app has no window.prompt).
    const [resetting, setResetting] = useState<{ userId: string; password: string; logout: boolean } | null>(null);
    const ownUserId = client.getUserId();

    const reload = useCallback(async (term: string) => {
        try {
            setUsers((await listUsers(client, { search: term, limit: 100 })).users);
        } catch (error) {
            onToast({ type: "error", message: `Couldn't load users: ${errorText(error)}` });
        }
    }, [client, onToast]);
    useEffect(() => {
        const timer = window.setTimeout(() => void reload(search), 200);
        return () => window.clearTimeout(timer);
    }, [reload, search]);

    const act = async (action: () => Promise<void>, done: string): Promise<void> => {
        try {
            await action();
            onToast({ type: "success", message: done });
            await reload(search);
        } catch (error) {
            onToast({ type: "error", message: errorText(error) });
        }
    };

    return (
        <div className="settings-section-card" data-testid="admin-users">
            <h3>Users</h3>
            <div className="admin-form-row">
                <label className="settings-field">
                    Username
                    <input type="text" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} placeholder="alice" />
                </label>
                <label className="settings-field">
                    Display name (optional)
                    <input type="text" value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} />
                </label>
                <label className="settings-field">
                    Password
                    <input type="text" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
                </label>
                <button
                    type="button"
                    className="settings-button"
                    disabled={!newUser.username.trim() || newUser.password.length < 8}
                    onClick={() =>
                        void createUserAccount(client, newUser)
                            .then((userId) => {
                                setReveal({ userId, password: newUser.password });
                                setNewUser({ username: "", displayName: "", password: generatePassword() });
                                return reload(search);
                            })
                            .catch((error) => onToast({ type: "error", message: errorText(error) }))
                    }
                >
                    Create account
                </button>
            </div>
            {reveal ? (
                <div className="admin-created" role="status">
                    <span>
                        <strong>{reveal.userId}</strong>, password <code data-testid="admin-revealed-password">{reveal.password}</code>
                    </span>
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => void copy(`${reveal.userId}\n${reveal.password}`).then(() => onToast({ type: "success", message: "Copied." }))}>
                        Copy
                    </button>
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => setReveal(null)}>
                        Done
                    </button>
                </div>
            ) : null}
            <label className="settings-field">
                Search users
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or username" />
            </label>
            <div className="admin-table" role="table" aria-label="Users">
                {users === null ? (
                    <p className="settings-tab-description">Loading...</p>
                ) : (
                    users.map((user) => (
                        <div key={user.name} className={`admin-row${user.deactivated ? " is-deactivated" : ""}`} role="row" data-user-id={user.name}>
                            <Avatar
                                className="admin-row-avatar"
                                name={user.displayname ?? user.name}
                                src={thumbnailFromMxc(client, user.avatar_url, 48, 48, "crop")}
                                seed={user.name}
                                userId={user.name}
                            />
                            <span className="admin-row-main">
                                <strong>{user.displayname ?? user.name}</strong>
                                <span className="admin-row-meta">
                                    {user.name}
                                    {user.admin ? " · Admin" : ""}
                                    {user.deactivated ? " · Deactivated" : ""}
                                </span>
                            </span>
                            {!user.deactivated ? (
                                <>
                                    <button
                                        type="button"
                                        className="settings-button settings-button-secondary"
                                        aria-expanded={resetting?.userId === user.name}
                                        onClick={() =>
                                            setResetting((current) =>
                                                current?.userId === user.name ? null : { userId: user.name, password: generatePassword(), logout: false },
                                            )
                                        }
                                    >
                                        Reset password
                                    </button>
                                    {user.name !== ownUserId ? (
                                        <>
                                            <button
                                                type="button"
                                                className="settings-button settings-button-secondary"
                                                onClick={() => void act(() => setUserAdmin(client, user.name, !user.admin), user.admin ? "Admin removed." : "Now a server admin.")}
                                            >
                                                {user.admin ? "Remove admin" : "Make admin"}
                                            </button>
                                            <button
                                                type="button"
                                                className="settings-button settings-button-danger"
                                                onClick={() => {
                                                    if (!window.confirm(`Deactivate ${user.name}? They can't sign in again. This can't be undone here.`)) return;
                                                    void act(() => deactivateUser(client, user.name), "Account deactivated.");
                                                }}
                                            >
                                                Deactivate
                                            </button>
                                        </>
                                    ) : null}
                                </>
                            ) : null}
                            {resetting?.userId === user.name ? (
                                <form
                                    className="admin-reset-form"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        const { password, logout } = resetting;
                                        void act(() => resetUserPassword(client, user.name, password, logout), "Password reset.").then(() => {
                                            setReveal({ userId: user.name, password });
                                            setResetting(null);
                                        });
                                    }}
                                >
                                    <label className="settings-field">
                                        New password (at least 8 characters)
                                        <input
                                            type="text"
                                            value={resetting.password}
                                            onChange={(event) => setResetting({ ...resetting, password: event.target.value })}
                                            autoFocus
                                        />
                                    </label>
                                    <label className="settings-toggle">
                                        <input
                                            type="checkbox"
                                            checked={resetting.logout}
                                            onChange={(event) => setResetting({ ...resetting, logout: event.target.checked })}
                                        />
                                        Also sign them out of every device
                                    </label>
                                    <div className="settings-actions-row">
                                        <button type="submit" className="settings-button" disabled={resetting.password.length < 8}>
                                            Set password
                                        </button>
                                        <button type="button" className="settings-button settings-button-secondary" onClick={() => setResetting(null)}>
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            ) : null}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export function ServerAdminTab({ client, onToast }: ServerAdminTabProps): React.ReactElement {
    // Checked again here, so even a hand-crafted way into this tab shows nothing to non-admins.
    const [allowed, setAllowed] = useState<boolean | null>(null);
    useEffect(() => {
        let cancelled = false;
        void isServerAdmin(client).then((admin) => {
            if (!cancelled) setAllowed(admin);
        });
        return () => {
            cancelled = true;
        };
    }, [client]);

    return (
        <div className="settings-tab">
            <h2 className="settings-tab-title">Server admin</h2>
            {allowed === null ? (
                <p className="settings-tab-description">Checking your permissions...</p>
            ) : !allowed ? (
                <p className="settings-tab-description">Only server admins can use this page.</p>
            ) : (
                <>
                    <p className="settings-tab-description">Manage {client.getDomain()}: invite codes and accounts.</p>
                    <TokensSection client={client} onToast={onToast} />
                    <UsersSection client={client} onToast={onToast} />
                </>
            )}
        </div>
    );
}
