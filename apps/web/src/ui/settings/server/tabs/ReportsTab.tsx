// SPDX-License-Identifier: AGPL-3.0-only
// Server Settings → Reports: reports sent to the server's moderators, with quick actions (warn, kick, ban, ban for
// a time, mute for a time, shadow mute), member records (everything moderators did to someone here, and what's
// in force now), and the report reasons members choose from (owner).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ClientEvent, RoomStateEvent, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import type { ToastState } from "../../../components/Toast";
import {
    applyModAction,
    isModerator,
    listReports,
    readModLog,
    readReportReasons,
    readSanction,
    resolveReport,
    saveReportReasons,
    type ReportItem,
} from "../../../../core/moderation/moderation";
import { DURATIONS, MOD_ACTION_LABELS, REPORT_REASONS_EVENT, reasonsFromLabels, type ModAction, type ModLogEntry } from "../../../../core/moderation/moderationProtocol";

interface ReportsTabProps {
    client: MatrixClient;
    spaceRoom: Room;
    onToast: (toast: Omit<ToastState, "id">) => void;
}

function useReports(client: MatrixClient, spaceId: string): ReportItem[] {
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const bump = (): void => setVersion((value) => value + 1);
        client.on(ClientEvent.Room, bump);
        client.on(RoomStateEvent.Events, bump);
        return () => {
            client.off(ClientEvent.Room, bump);
            client.off(RoomStateEvent.Events, bump);
        };
    }, [client]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => listReports(client, spaceId), [client, spaceId, version]);
}

const when = (ts: number): string => new Date(ts).toLocaleString();

interface QuickActionsProps {
    client: MatrixClient;
    space: Room;
    userId: string;
    defaultReason: string;
    onDone: (action: ModAction, summary: string) => void;
    onToast: ReportsTabProps["onToast"];
}

// The moderator's buttons for one person. Timed ones ask how long first.
export function QuickActions({ client, space, userId, defaultReason, onDone, onToast }: QuickActionsProps): React.ReactElement {
    const [busy, setBusy] = useState(false);
    const [duration, setDuration] = useState(DURATIONS[2]!.ms);
    const [reason, setReason] = useState(defaultReason);
    const sanction = readSanction(space, userId);
    const membership = space.getMember(userId)?.membership;
    const name = space.getMember(userId)?.name ?? userId;
    const durationLabel = DURATIONS.find((option) => option.ms === duration)?.label ?? "";

    const run = async (action: ModAction, confirmText: string | null, summary: string): Promise<void> => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(true);
        try {
            await applyModAction(client, space, userId, action, { reason, durationMs: action === "timed_ban" || action === "mute" ? duration : undefined });
            onToast({ type: "success", message: summary });
            onDone(action, summary);
        } catch (error) {
            onToast({ type: "error", message: error instanceof Error ? error.message : "That didn't work. Check your role can do it." });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mod-actions" data-testid="mod-actions">
            <label className="settings-field">
                <span>Reason (saved in the member record)</span>
                <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} />
            </label>
            <label className="settings-field mod-duration">
                <span>For timed actions</span>
                <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} aria-label="How long">
                    {DURATIONS.map((option) => (
                        <option key={option.ms} value={option.ms}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </label>
            <div className="mod-action-buttons">
                <button type="button" className="settings-button settings-button-secondary" disabled={busy} onClick={() => void run("warn", null, `Warned ${name}.`)}>
                    Warn
                </button>
                {sanction.muteUntil ? (
                    <button type="button" className="settings-button settings-button-secondary" disabled={busy} onClick={() => void run("unmute", null, `Unmuted ${name}.`)}>
                        Unmute
                    </button>
                ) : (
                    <button type="button" className="settings-button settings-button-secondary" disabled={busy} onClick={() => void run("mute", null, `Muted ${name} for ${durationLabel}.`)} data-testid="mod-mute">
                        Mute for {durationLabel}
                    </button>
                )}
                {sanction.shadow ? (
                    <button type="button" className="settings-button settings-button-secondary" disabled={busy} onClick={() => void run("unshadow", null, `Lifted ${name}'s shadow mute.`)} data-testid="mod-unshadow">
                        Lift shadow mute
                    </button>
                ) : (
                    <button
                        type="button"
                        className="settings-button settings-button-secondary"
                        disabled={busy}
                        title="Their messages are hidden from everyone else in this server; they aren't told."
                        onClick={() => void run("shadow_mute", null, `Shadow muted ${name}.`)}
                        data-testid="mod-shadow"
                    >
                        Shadow mute
                    </button>
                )}
                {membership === "join" || membership === "invite" ? (
                    <button type="button" className="settings-button settings-button-danger" disabled={busy} onClick={() => void run("kick", `Kick ${name} from the server? They can join again.`, `Kicked ${name}.`)} data-testid="mod-kick">
                        Kick
                    </button>
                ) : null}
                {membership === "ban" ? (
                    <button type="button" className="settings-button settings-button-secondary" disabled={busy} onClick={() => void run("unban", null, `Unbanned ${name}.`)}>
                        Unban
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            className="settings-button settings-button-danger"
                            disabled={busy}
                            onClick={() => void run("timed_ban", `Ban ${name} for ${durationLabel}?`, `Banned ${name} for ${durationLabel}.`)}
                            data-testid="mod-timed-ban"
                        >
                            Ban for {durationLabel}
                        </button>
                        <button type="button" className="settings-button settings-button-danger" disabled={busy} onClick={() => void run("ban", `Ban ${name} from the server?`, `Banned ${name}.`)} data-testid="mod-ban">
                            Ban
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function MemberRecord({ client, space, userId, onToast }: { client: MatrixClient; space: Room; userId: string; onToast: ReportsTabProps["onToast"] }): React.ReactElement {
    const [entries, setEntries] = useState<ModLogEntry[] | null>(null);
    const [version, setVersion] = useState(0);
    useEffect(() => {
        let cancelled = false;
        setEntries(null);
        void readModLog(client, space, userId).then((found) => {
            if (!cancelled) setEntries(found);
        });
        return () => {
            cancelled = true;
        };
    }, [client, space, userId, version]);
    const sanction = readSanction(space, userId);
    const now = Date.now();
    const inForce = [
        space.getMember(userId)?.membership === "ban" ? (sanction.banUntil ? `Banned until ${when(sanction.banUntil)}` : "Banned") : null,
        sanction.muteUntil && sanction.muteUntil > now ? `Muted until ${when(sanction.muteUntil)}` : null,
        sanction.shadow ? "Shadow muted" : null,
    ].filter(Boolean);
    const name = (id: string): string => space.getMember(id)?.name ?? id;

    return (
        <div className="mod-record" data-testid="member-record">
            <p className="settings-inline-note">{inForce.length ? `Now: ${inForce.join(" · ")}` : "Nothing in force now."}</p>
            <QuickActions client={client} space={space} userId={userId} defaultReason="" onDone={() => setVersion((value) => value + 1)} onToast={onToast} />
            <h4>History</h4>
            {entries === null ? (
                <p className="settings-inline-note">Loading…</p>
            ) : entries.length === 0 ? (
                <p className="settings-inline-note">No moderation actions here yet.</p>
            ) : (
                <ul className="mod-history">
                    {entries.map((entry, index) => (
                        <li key={`${entry.at}-${index}`}>
                            <strong>{MOD_ACTION_LABELS[entry.action]}</strong>
                            {entry.until ? ` until ${when(entry.until)}` : ""} · by {name(entry.by)} · {when(entry.at)}
                            {entry.reason ? <span className="mod-history-reason">{entry.reason}</span> : null}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function ReportsTab({ client, spaceRoom, onToast }: ReportsTabProps): React.ReactElement {
    const me = client.getSafeUserId();
    const moderator = isModerator(spaceRoom, me);
    const reports = useReports(client, spaceRoom.roomId);
    const [openReportId, setOpenReportId] = useState<string | null>(null);
    const [recordUserId, setRecordUserId] = useState("");
    const reasons = useMemo(() => readReportReasons(spaceRoom), [spaceRoom, reports]);
    const canEditReasons = spaceRoom.currentState.maySendStateEvent(REPORT_REASONS_EVENT, me);
    const [reasonsText, setReasonsText] = useState(reasons.map((reason) => reason.label).join("\n"));
    const members = spaceRoom.getMembers().filter((member) => ["join", "ban", "leave"].includes(member.membership ?? ""));

    // Reports you're invited to are opened (joined) so their details show.
    const join = useCallback(
        (item: ReportItem): void => {
            if (item.room.getMyMembership() === "invite") void client.joinRoom(item.room.roomId).catch(() => undefined);
        },
        [client],
    );
    useEffect(() => {
        if (moderator) reports.filter((item) => !item.details).forEach(join);
    }, [join, moderator, reports]);

    if (!moderator) {
        return (
            <div className="settings-tab" data-testid="reports-tab">
                <h2 className="settings-tab-title">Reports</h2>
                <p className="settings-tab-description">Only the server&apos;s moderators (who can ban) see reports.</p>
            </div>
        );
    }

    const open = reports.filter((item) => item.status === "open" && item.details);
    const done = reports.filter((item) => item.status === "resolved" && item.details).slice(0, 20);
    const name = (id: string): string => spaceRoom.getMember(id)?.name ?? id;

    const renderReport = (item: ReportItem): React.ReactElement => {
        const details = item.details!;
        const expanded = openReportId === item.room.roomId;
        return (
            <li key={item.room.roomId} className={`mod-report${item.status === "resolved" ? " is-resolved" : ""}`} data-testid="mod-report">
                <button type="button" className="mod-report-summary" onClick={() => setOpenReportId(expanded ? null : item.room.roomId)} aria-expanded={expanded}>
                    <strong>{name(details.reportedUser)}</strong>
                    <span className="mod-report-reason">{details.reason}</span>
                    <span className="mod-report-meta">
                        by {name(item.reporter)} · {when(item.at)}
                        {item.status === "resolved" ? ` · ${item.outcome ?? "handled"}` : ""}
                    </span>
                </button>
                {expanded ? (
                    <div className="mod-report-body">
                        {details.excerpt ? <blockquote className="report-excerpt">{details.excerpt}</blockquote> : null}
                        {details.note ? <p>&ldquo;{details.note}&rdquo;</p> : null}
                        {item.status === "open" ? (
                            <>
                                <QuickActions
                                    client={client}
                                    space={spaceRoom}
                                    userId={details.reportedUser}
                                    defaultReason={details.reason}
                                    onToast={onToast}
                                    onDone={(_action, summary) => void resolveReport(client, item.room, summary).catch(() => undefined)}
                                />
                                <button
                                    type="button"
                                    className="settings-button settings-button-secondary"
                                    onClick={() =>
                                        void applyModAction(client, spaceRoom, details.reportedUser, "dismiss", { reason: details.reason })
                                            .then(() => resolveReport(client, item.room, "Dismissed"))
                                            .catch(() => undefined)
                                    }
                                    data-testid="mod-dismiss"
                                >
                                    Dismiss report
                                </button>
                            </>
                        ) : null}
                        <button type="button" className="settings-link-button" onClick={() => setRecordUserId(details.reportedUser)}>
                            See {name(details.reportedUser)}&apos;s record
                        </button>
                    </div>
                ) : null}
            </li>
        );
    };

    return (
        <div className="settings-tab" data-testid="reports-tab">
            <h2 className="settings-tab-title">Reports</h2>
            <p className="settings-tab-description">Reports from members go to everyone here who can ban. The person reported isn&apos;t told who reported them.</p>

            <div className="settings-section-card">
                <h3>Open reports{open.length ? ` (${open.length})` : ""}</h3>
                {open.length ? <ul className="mod-report-list">{open.map(renderReport)}</ul> : <p className="settings-inline-note">No open reports.</p>}
                {done.length ? (
                    <details>
                        <summary>Handled ({done.length})</summary>
                        <ul className="mod-report-list">{done.map(renderReport)}</ul>
                    </details>
                ) : null}
            </div>

            <div className="settings-section-card">
                <h3>Member records</h3>
                <label className="settings-field">
                    <span>Member</span>
                    <select value={recordUserId} onChange={(event) => setRecordUserId(event.target.value)} data-testid="record-member">
                        <option value="">Choose someone…</option>
                        {members
                            .filter((member) => member.userId !== me)
                            .map((member) => (
                                <option key={member.userId} value={member.userId}>
                                    {member.name} ({member.userId}){member.membership === "ban" ? " · banned" : member.membership === "leave" ? " · left" : ""}
                                </option>
                            ))}
                    </select>
                </label>
                {recordUserId ? <MemberRecord key={recordUserId} client={client} space={spaceRoom} userId={recordUserId} onToast={onToast} /> : null}
            </div>

            <div className="settings-section-card">
                <h3>Report reasons</h3>
                <label className="settings-field">
                    <span>What members pick from when they report someone, one per line (up to 20)</span>
                    <textarea
                        value={reasonsText}
                        onChange={(event) => setReasonsText(event.target.value)}
                        rows={6}
                        disabled={!canEditReasons}
                        aria-label="Report reasons"
                        data-testid="report-reasons"
                    />
                </label>
                <button
                    type="button"
                    className="settings-button"
                    disabled={!canEditReasons}
                    onClick={() =>
                        void saveReportReasons(client, spaceRoom, reasonsFromLabels(reasonsText.split("\n")))
                            .then(() => onToast({ type: "success", message: "Report reasons saved." }))
                            .catch((error: unknown) => onToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't save." }))
                    }
                    data-testid="report-reasons-save"
                >
                    Save reasons
                </button>
            </div>
        </div>
    );
}
