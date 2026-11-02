// SPDX-License-Identifier: AGPL-3.0-only
// Server Settings → Bots: the server's bot accounts (any Matrix account; the Meadhall bot in apps/bot does
// onboarding, welcome messages, auto-mod and moderation commands). Adding one invites it to the server and its
// channels, can give it roles, and tags it BOT everywhere; its slash commands show in the message box.
import React, { useMemo, useState } from "react";
import { EventType, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import type { ToastState } from "../../../components/Toast";
import { BOTS_EVENT, isUserId } from "../../../../core/bots/botProtocol";
import { BOT_STATE_TYPES, addBot, readBots, readServerCommands, removeBot, useSpaceState } from "../../../../core/bots/serverBots";
import { readAssignments, readRoles } from "../../../../core/roles/applyRoles";

interface BotsTabProps {
    client: MatrixClient;
    spaceRoom: Room;
    channels: Room[];
    onToast: (toast: Omit<ToastState, "id">) => void;
}

export function BotsTab({ client, spaceRoom, channels, onToast }: BotsTabProps): React.ReactElement {
    const revision = useSpaceState(spaceRoom, BOT_STATE_TYPES);
    const bots = useMemo(() => readBots(spaceRoom), [spaceRoom, revision]);
    const commands = useMemo(() => readServerCommands(spaceRoom), [spaceRoom, revision]);
    const roles = useMemo(() => readRoles(spaceRoom), [spaceRoom, revision]);
    const assignments = useMemo(() => readAssignments(spaceRoom, roles), [spaceRoom, roles]);
    const canManage = spaceRoom.currentState.maySendStateEvent(BOTS_EVENT, client.getSafeUserId());
    const canSetRoles = spaceRoom.currentState.maySendStateEvent(EventType.RoomPowerLevels, client.getSafeUserId());
    const [botId, setBotId] = useState("");
    const [roleIds, setRoleIds] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    const run = async (action: () => Promise<void>, done: string): Promise<void> => {
        setBusy(true);
        try {
            await action();
            onToast({ type: "success", message: done });
        } catch (error) {
            onToast({ type: "error", message: error instanceof Error ? error.message : "Something went wrong." });
        } finally {
            setBusy(false);
        }
    };

    const trimmed = botId.trim();
    const validId = isUserId(trimmed) && trimmed !== client.getUserId();
    return (
        <div className="settings-tab" data-testid="bots-tab">
            <h2 className="settings-tab-title">Bots</h2>
            <p className="settings-tab-description">
                Bots are Matrix accounts that work for the space: the Meadhall bot greets new members, runs onboarding and
                auto-mod, and answers moderation commands. Their commands appear when you type / in the message box.
            </p>

            <div className="settings-section-card">
                <h3>Your bots</h3>
                {bots.length === 0 ? <p className="settings-inline-note">No bots yet.</p> : null}
                <ul className="bot-list">
                    {bots.map((bot) => {
                        const member = spaceRoom.getMember(bot.userId);
                        const botCommands = commands.filter((command) => command.bot === bot.userId);
                        const botRoles = roles.filter((role) => assignments.get(bot.userId)?.includes(role.id));
                        return (
                            <li key={bot.userId} className="bot-row" data-testid="bot-row">
                                <span className="bot-row-main">
                                    <strong>
                                        {member?.name ?? bot.userId} <span className="bot-tag">BOT</span>
                                    </strong>
                                    <small>{bot.userId}</small>
                                    <small>
                                        {member?.membership === "join" ? "In the space" : member?.membership === "invite" ? "Invited, not joined yet" : "Not in the space"}
                                        {botRoles.length ? ` · ${botRoles.map((role) => role.name).join(", ")}` : ""}
                                        {` · ${botCommands.length === 1 ? "1 command" : `${botCommands.length} commands`}`}
                                    </small>
                                    {botCommands.length ? (
                                        <span className="bot-row-commands">
                                            {botCommands.map((command) => (
                                                <code key={command.name} title={command.description}>
                                                    /{command.name}
                                                </code>
                                            ))}
                                        </span>
                                    ) : null}
                                </span>
                                {canManage ? (
                                    <button
                                        type="button"
                                        className="settings-button settings-button-danger"
                                        disabled={busy}
                                        onClick={() => {
                                            if (window.confirm(`Remove ${member?.name ?? bot.userId} from the server?`)) {
                                                void run(() => removeBot(client, spaceRoom, channels, bot.userId), "Bot removed.");
                                            }
                                        }}
                                    >
                                        Remove
                                    </button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            </div>

            {canManage ? (
                <form
                    className="settings-section-card"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!validId) return;
                        void run(async () => {
                            await addBot(client, spaceRoom, channels, trimmed, roleIds);
                            setBotId("");
                            setRoleIds([]);
                        }, "Bot added. It joins once it accepts the invite.");
                    }}
                >
                    <h3>Add a bot</h3>
                    <label className="settings-field">
                        <span>Bot&apos;s Matrix ID</span>
                        <input value={botId} onChange={(event) => setBotId(event.target.value)} placeholder="@meadhall-bot:example.org" aria-label="Bot's Matrix ID" disabled={busy} />
                    </label>
                    {roles.length > 0 && canSetRoles ? (
                        <fieldset className="settings-fieldset">
                            <legend>Roles (what the bot may do)</legend>
                            {roles.map((role) => (
                                <label key={role.id} className="settings-toggle">
                                    <input
                                        type="checkbox"
                                        checked={roleIds.includes(role.id)}
                                        onChange={(event) => setRoleIds((current) => (event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id)))}
                                        disabled={busy}
                                    />
                                    <span className="roles-dot" style={{ background: role.color }} aria-hidden="true" />
                                    {role.name} <small>({role.permissions.length ? role.permissions.join(", ").replaceAll("_", " ") : "no permissions"})</small>
                                </label>
                            ))}
                            <p className="settings-inline-note">
                                For onboarding and auto-mod, give the bot a role that can manage roles, kick and manage messages.
                            </p>
                        </fieldset>
                    ) : null}
                    <div className="settings-actions-row">
                        <button type="submit" className="settings-button" disabled={busy || !validId}>
                            {busy ? "Adding…" : "Add bot"}
                        </button>
                    </div>
                    <p className="settings-inline-note">
                        Run your own Meadhall bot from <code>apps/bot</code> in the Meadhall repository (setup in its README).
                    </p>
                </form>
            ) : (
                <p className="settings-inline-note">Only space admins can add or remove bots.</p>
            )}
        </div>
    );
}
