// SPDX-License-Identifier: AGPL-3.0-only
import React from "react";

import { useDesktopUpdates } from "../../../hooks/useDesktopUpdates";
import type { HeorotDesktopUpdateStatus } from "../../../types/heorotDesktop";

function describe(status: HeorotDesktopUpdateStatus | null): string {
    switch (status?.state) {
        case "checking":
            return "Checking for updates…";
        case "up-to-date":
            return "You're on the latest version.";
        case "available":
            return `Meadhall ${status.version} is available.`;
        case "downloading":
            return `Downloading Meadhall ${status.version}… ${status.percent}%`;
        case "downloaded":
            return `Meadhall ${status.version} is downloaded. Installing and restarting…`;
        case "error":
            return `Couldn't check for updates: ${status.message}`;
        default:
            return "Updates are checked automatically every few hours.";
    }
}

export function UpdatesTab(): React.ReactElement {
    const { status, appVersion, checkForUpdates, updateNow } = useDesktopUpdates();
    const busy = status?.state === "checking" || status?.state === "downloading" || status?.state === "downloaded";

    return (
        <div className="settings-tab">
            <h2 className="settings-tab-title">Updates</h2>
            <p className="settings-tab-description">
                Meadhall updates from its GitHub releases. Updating downloads the new version, installs it and restarts
                the app.
            </p>

            <div className="settings-section-card">
                <h3>Meadhall {appVersion ?? ""}</h3>
                <p className="settings-updates-status" role="status">
                    {describe(status)}
                </p>
                <div className="settings-theme-row">
                    {status?.state === "available" || status?.state === "error" ? (
                        <button type="button" className="settings-button" onClick={updateNow} disabled={busy}>
                            {status.state === "available" ? `Update to ${status.version}` : "Try again"}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="settings-button settings-button-secondary"
                        onClick={checkForUpdates}
                        disabled={busy}
                    >
                        Check for updates
                    </button>
                </div>
            </div>
        </div>
    );
}
