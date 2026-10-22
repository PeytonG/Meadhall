// SPDX-License-Identifier: AGPL-3.0-only
import React, { useState } from "react";

import { useDesktopUpdates } from "../hooks/useDesktopUpdates";

// Desktop only: tells the user a new version is out and installs it on "Update now"
// (download, install, restart). Background check failures stay quiet; failures after "Update now" are shown.
export function DesktopUpdateBanner(): React.ReactElement | null {
    const { status, updateNow } = useDesktopUpdates();
    const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
    const [userStarted, setUserStarted] = useState(false);

    if (!status) {
        return null;
    }

    const start = (): void => {
        setUserStarted(true);
        updateNow();
    };

    if (status.state === "available" || (status.state === "downloaded" && !userStarted)) {
        if (dismissedVersion === status.version) {
            return null;
        }
        return (
            <div className="desktop-update-banner" role="status">
                <span>
                    {status.state === "available"
                        ? `Meadhall ${status.version} is available.`
                        : `Meadhall ${status.version} is ready to install.`}
                </span>
                <button type="button" className="desktop-update-banner-primary" onClick={start}>
                    {status.state === "available" ? "Update now" : "Restart to update"}
                </button>
                <button type="button" className="desktop-update-banner-dismiss" onClick={() => setDismissedVersion(status.version)}>
                    Later
                </button>
            </div>
        );
    }

    if (status.state === "downloading") {
        return (
            <div className="desktop-update-banner" role="status">
                <span>
                    Downloading Meadhall {status.version}… {status.percent}%
                </span>
                <span className="desktop-update-progress" aria-hidden="true">
                    <span style={{ width: `${status.percent}%` }} />
                </span>
            </div>
        );
    }

    if (status.state === "downloaded") {
        return (
            <div className="desktop-update-banner" role="status">
                <span>Installing Meadhall {status.version} and restarting…</span>
            </div>
        );
    }

    if (status.state === "error" && userStarted) {
        return (
            <div className="desktop-update-banner" role="alert">
                <span>The update failed: {status.message}</span>
                <button type="button" className="desktop-update-banner-primary" onClick={start}>
                    Try again
                </button>
                <button type="button" className="desktop-update-banner-dismiss" onClick={() => setUserStarted(false)}>
                    Dismiss
                </button>
            </div>
        );
    }

    return null;
}
