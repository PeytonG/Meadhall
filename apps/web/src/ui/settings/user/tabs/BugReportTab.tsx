// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Report a bug: what went wrong, an optional screenshot and recent logs, sent from your account to the
// Meadhall developer (see core/bugReport for how the message stays out of your room list).
import React, { useEffect, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import {
    BUG_CATEGORIES,
    BUG_REPORT_MAX_DESCRIPTION,
    BUG_REPORT_MAX_IMAGE_BYTES,
    getBugReportRecipient,
    sendBugReport,
    type BugCategory,
} from "../../../../core/bugReport/bugReport";
import type { CoreConfig } from "../../../../core/config/configTypes";
import { currentAppVersion } from "../../../../core/updates/mobileUpdates";
import { readAppLog } from "../../../logs/appLog";
import { currentPlatform } from "../../../presence/clientStatus";
import { formatCallLog, readCallLog } from "../../../voice/callLog";

interface BugReportTabProps {
    client: MatrixClient;
    config: CoreConfig | null | undefined;
    onToast: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

async function appDetails(includeLogs: boolean): Promise<string> {
    const version = (await window.heorotDesktop?.getAppVersion?.().catch(() => "")) || currentAppVersion() || "web";
    const lines = [`Version: ${version} (${currentPlatform()}, ${navigator.userAgent})`];
    if (includeLogs) {
        const errors = readAppLog().slice(-15);
        const calls = readCallLog().slice(-15);
        if (errors.length > 0) {
            lines.push("", "Recent errors:", ...errors.map((entry) => `${new Date(entry.at).toISOString()} [${entry.source}] ${entry.message}`));
        }
        if (calls.length > 0) lines.push("", "Recent calls:", formatCallLog(calls));
    }
    return lines.join("\n");
}

export function BugReportTab({ client, config, onToast }: BugReportTabProps): React.ReactElement {
    const [category, setCategory] = useState<BugCategory>(BUG_CATEGORIES[0]);
    const [description, setDescription] = useState("");
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [includeLogs, setIncludeLogs] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        if (!image) return setPreview(null);
        const url = URL.createObjectURL(image);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [image]);

    const pickImage = (file: File | undefined): void => {
        setError(null);
        if (!file) return setImage(null);
        if (!file.type.startsWith("image/")) return setError("Pick an image file (PNG, JPEG, GIF or WebP).");
        if (file.size > BUG_REPORT_MAX_IMAGE_BYTES) return setError("That image is over 8 MB. Try a smaller screenshot.");
        setImage(file);
    };

    const submit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setSending(true);
        setError(null);
        try {
            await sendBugReport(client, getBugReportRecipient(config), {
                category,
                description,
                image,
                details: await appDetails(includeLogs),
            });
            setSent(true);
            setDescription("");
            setImage(null);
            onToast({ type: "success", message: "Bug report sent. Thank you!" });
        } catch (sendError) {
            setError(sendError instanceof Error ? sendError.message : "Couldn't send the report.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="settings-tab" data-testid="bug-report-tab">
            <h2 className="settings-tab-title">Report a bug</h2>
            <p className="settings-tab-description">
                Tell the Meadhall developer what went wrong. It's sent as a message from your account and won't appear in
                your chats. It isn't end-to-end encrypted, so leave out anything private.
            </p>

            {sent ? (
                <div className="settings-section-card" role="status" data-testid="bug-report-sent">
                    <h3>Thanks, your report was sent.</h3>
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => setSent(false)}>
                        Report something else
                    </button>
                </div>
            ) : (
                <form className="settings-section-card" onSubmit={(event) => void submit(event)}>
                    <label className="settings-field">
                        <span>What kind of problem?</span>
                        <select value={category} onChange={(event) => setCategory(event.target.value as BugCategory)} disabled={sending}>
                            {BUG_CATEGORIES.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="settings-field">
                        <span>What happened?</span>
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            maxLength={BUG_REPORT_MAX_DESCRIPTION}
                            rows={6}
                            placeholder="What you did, what you expected, and what happened instead."
                            disabled={sending}
                            required
                        />
                    </label>

                    <label className="settings-field">
                        <span>Screenshot (optional, up to 8 MB)</span>
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/gif,image/webp"
                            onChange={(event) => pickImage(event.target.files?.[0])}
                            disabled={sending}
                        />
                    </label>
                    {preview ? (
                        <div className="bug-report-preview">
                            <img src={preview} alt="Screenshot to send" />
                            <button type="button" className="settings-button settings-button-secondary" onClick={() => setImage(null)} disabled={sending}>
                                Remove
                            </button>
                        </div>
                    ) : null}

                    <label className="settings-toggle">
                        <input type="checkbox" checked={includeLogs} onChange={(event) => setIncludeLogs(event.target.checked)} disabled={sending} />
                        <span>Include the app version and recent logs (Settings → Logs)</span>
                    </label>

                    {error ? (
                        <p className="settings-inline-error" role="alert">
                            {error}
                        </p>
                    ) : null}

                    <div className="settings-actions-row">
                        <button type="submit" className="settings-button" disabled={sending || !description.trim()}>
                            {sending ? "Sending…" : "Send report"}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
