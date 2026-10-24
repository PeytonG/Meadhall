// SPDX-License-Identifier: AGPL-3.0-only
// A call that ended without you choosing to (alone too long, dropped and couldn't rejoin): a notice saying why that stays
// until dismissed, wherever you are in the app, with the full history one click away in Settings → Logs.
import React, { useEffect, useState } from "react";

import { onCallEnded } from "../../voice/callLog";

export function CallEndedNotice({ onViewDetails }: { onViewDetails: () => void }): React.ReactElement | null {
    const [reason, setReason] = useState<string | null>(null);
    useEffect(() => onCallEnded(setReason), []);
    if (!reason) return null;
    return (
        <div className="desktop-update-banner call-ended-notice" role="alert" data-testid="call-ended-notice">
            <span>
                <strong>Call ended.</strong> {reason}
            </span>
            <button
                type="button"
                className="desktop-update-banner-primary"
                onClick={() => {
                    setReason(null);
                    onViewDetails();
                }}
            >
                View details
            </button>
            <button type="button" className="desktop-update-banner-dismiss" onClick={() => setReason(null)}>
                Dismiss
            </button>
        </div>
    );
}
