// SPDX-License-Identifier: AGPL-3.0-only
// Under a message that has a thread: "3 replies", who answered last and what they said, with a dot while there are
// replies you haven't read. Click to open the thread beside the chat.
import React from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import type { ThreadSummary } from "./threads";

interface ThreadSummaryBarProps {
    client: MatrixClient;
    summary: ThreadSummary | null;
    onOpen: () => void;
}

export function ThreadSummaryBar({ client, summary, onOpen }: ThreadSummaryBarProps): React.ReactElement | null {
    if (!summary) return null;
    const replies = summary.count === 1 ? "1 reply" : `${summary.count} replies`;
    const lastSender = summary.lastSenderId === client.getUserId() ? "You" : summary.lastSenderName;
    return (
        <button
            type="button"
            className={`thread-summary${summary.unread > 0 ? " has-unread" : ""}`}
            onClick={onOpen}
            data-testid="thread-summary"
            aria-label={`Open thread, ${replies}${summary.unread > 0 ? `, ${summary.unread} unread` : ""}`}
        >
            <span className="thread-summary-count">{replies}</span>
            {lastSender && summary.lastBody ? (
                <span className="thread-summary-last">
                    <strong>{lastSender}</strong> {summary.lastBody}
                </span>
            ) : null}
            {summary.unread > 0 ? <span className="thread-summary-unread" aria-hidden="true" /> : null}
            <span className="thread-summary-arrow" aria-hidden="true">
                ›
            </span>
        </button>
    );
}
