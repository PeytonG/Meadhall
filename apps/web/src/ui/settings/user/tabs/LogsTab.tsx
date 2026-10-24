// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Logs: why calls ended, and errors the app ran into, with what they usually mean. Everything here stays on
// this device; "Copy" puts it on the clipboard for a bug report.
import React, { useEffect, useState } from "react";

import { clearAppLog, hintFor, onAppLogChange, readAppLog, type AppLogEntry } from "../../../logs/appLog";
import { formatCallLog, readCallLog, type CallLogEntry } from "../../../voice/callLog";

function when(at: number): string {
    return new Date(at).toLocaleString();
}

export function LogsTab(): React.ReactElement {
    const [errors, setErrors] = useState<AppLogEntry[]>(() => readAppLog());
    const [calls, setCalls] = useState<CallLogEntry[]>(() => readCallLog());
    const [copied, setCopied] = useState<string | null>(null);
    useEffect(() => onAppLogChange(() => setErrors(readAppLog())), []);

    const copy = (label: string, text: string): void => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(label));
    };
    const errorsText = errors
        .map((entry) => {
            const hint = hintFor(entry.message);
            return `${when(entry.at)}  [${entry.source}] ${entry.message}${hint ? `\n    → ${hint}` : ""}`;
        })
        .join("\n");

    return (
        <div className="settings-tab" data-testid="logs-tab">
            <h2 className="settings-tab-title">Logs</h2>
            <p className="settings-tab-description">
                What went wrong and when, to help sort problems out. Kept on this device only; copy it into a bug report if
                you need help.
            </p>

            <div className="settings-section-card" data-testid="logs-calls">
                <h3>Calls</h3>
                <p className="settings-tab-description">When you joined, why calls ended or dropped, and rejoins.</p>
                {calls.length === 0 ? (
                    <p className="settings-inline-note">No calls yet.</p>
                ) : (
                    <ul className="logs-list">
                        {calls
                            .slice()
                            .reverse()
                            .map((entry, index) => (
                                <li key={`${entry.at}-${index}`} className={/^(Left|Dropped|Gave up)/.test(entry.event) ? "is-problem" : ""}>
                                    <time>{when(entry.at)}</time>
                                    <span>
                                        {entry.event}
                                        {entry.detail ? `: ${entry.detail}` : ""}
                                    </span>
                                    {/^(Left|Dropped|Gave up)/.test(entry.event) && hintFor(`${entry.event} ${entry.detail ?? ""}`) ? (
                                        <small>{hintFor(`${entry.event} ${entry.detail ?? ""}`)}</small>
                                    ) : null}
                                </li>
                            ))}
                    </ul>
                )}
                <div className="settings-actions-row">
                    <button type="button" className="settings-button settings-button-secondary" disabled={calls.length === 0} onClick={() => copy("calls", formatCallLog(calls))}>
                        {copied === "calls" ? "Copied" : "Copy"}
                    </button>
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => setCalls(readCallLog())}>
                        Refresh
                    </button>
                </div>
            </div>

            <div className="settings-section-card" data-testid="logs-errors">
                <h3>Errors</h3>
                <p className="settings-tab-description">Errors the app showed or ran into, newest first, with what they usually mean.</p>
                {errors.length === 0 ? (
                    <p className="settings-inline-note">No errors. 🎉</p>
                ) : (
                    <ul className="logs-list">
                        {errors
                            .slice()
                            .reverse()
                            .map((entry, index) => (
                                <li key={`${entry.at}-${index}`} className="is-problem">
                                    <time>
                                        {when(entry.at)} · {entry.source}
                                    </time>
                                    <span>{entry.message}</span>
                                    {hintFor(entry.message) ? <small>{hintFor(entry.message)}</small> : null}
                                </li>
                            ))}
                    </ul>
                )}
                <div className="settings-actions-row">
                    <button type="button" className="settings-button settings-button-secondary" disabled={errors.length === 0} onClick={() => copy("errors", errorsText)}>
                        {copied === "errors" ? "Copied" : "Copy"}
                    </button>
                    <button type="button" className="settings-button settings-button-secondary" disabled={errors.length === 0} onClick={clearAppLog}>
                        Clear
                    </button>
                </div>
            </div>
        </div>
    );
}
