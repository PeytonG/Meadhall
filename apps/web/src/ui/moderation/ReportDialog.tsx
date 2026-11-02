// SPDX-License-Identifier: AGPL-3.0-only
// Report someone (or one of their messages) to the server's moderators, with one of the reasons the server's owner
// chose (Server Settings → Reports).
import React, { useMemo, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { createReport, readReportReasons } from "../../core/moderation/moderation";
import { RoomDialog } from "../components/rooms/RoomDialog";

interface ReportDialogProps {
    client: MatrixClient;
    space: Room;
    userId: string;
    // When reporting a message.
    message?: { roomId: string; eventId: string; excerpt: string };
    onClose: () => void;
    onDone: (message: string) => void;
}

export function ReportDialog({ client, space, userId, message, onClose, onDone }: ReportDialogProps): React.ReactElement {
    const reasons = useMemo(() => readReportReasons(space), [space]);
    const [reasonId, setReasonId] = useState(reasons[0]?.id ?? "");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const name = space.getMember(userId)?.name ?? userId;

    const submit = async (): Promise<void> => {
        const reason = reasons.find((candidate) => candidate.id === reasonId);
        if (!reason) return;
        setBusy(true);
        setError(null);
        try {
            await createReport(client, space, {
                reportedUser: userId,
                reasonId: reason.id,
                reason: reason.label,
                note,
                ...(message ?? {}),
            });
            onDone(`Reported ${name} to ${space.name || "the space"}'s moderators.`);
        } catch (reportError) {
            setError(reportError instanceof Error ? reportError.message : "Couldn't send the report.");
            setBusy(false);
        }
    };

    return (
        <RoomDialog
            open
            title={message ? "Report message" : `Report ${name}`}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="settings-button settings-button-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="settings-button settings-button-danger" onClick={() => void submit()} disabled={busy || !reasonId} data-testid="report-send">
                        {busy ? "Sending…" : "Send report"}
                    </button>
                </>
            }
        >
            <div className="report-dialog" data-testid="report-dialog">
                <p className="settings-tab-description">
                    Only {space.name || "the space"}&apos;s moderators see your report{message ? " and the message" : ""}. {name} isn&apos;t told who
                    reported them.
                </p>
                {message ? <blockquote className="report-excerpt">{message.excerpt || "(no text)"}</blockquote> : null}
                <fieldset className="report-reasons">
                    <legend>What&apos;s wrong?</legend>
                    {reasons.map((reason) => (
                        <label key={reason.id} className="report-reason">
                            <input type="radio" name="report-reason" value={reason.id} checked={reasonId === reason.id} onChange={() => setReasonId(reason.id)} />
                            {reason.label}
                        </label>
                    ))}
                </fieldset>
                <label className="settings-field">
                    <span>Anything moderators should know (optional)</span>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} data-testid="report-note" />
                </label>
                {error ? <p className="settings-inline-error">{error}</p> : null}
            </div>
        </RoomDialog>
    );
}
