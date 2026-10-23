// SPDX-License-Identifier: AGPL-3.0-only
import React, { useState } from "react";

import { dismissedUpdateVersion, dismissUpdateVersion } from "../../core/updates/mobileUpdates";
import { useMobileUpdates } from "../hooks/useMobileUpdates";

// Android/iOS: a newer release is out. Android installs it from the GitHub release by hand; iOS (Beta) through
// TestFlight. Settings → Updates explains the steps and can turn this notice off.
export function MobileUpdateBanner({ onOpenUpdateSettings }: { onOpenUpdateSettings: () => void }): React.ReactElement | null {
    const { supported, updateAvailable, latest, noticeEnabled, platform } = useMobileUpdates();
    const [dismissed, setDismissed] = useState(dismissedUpdateVersion);
    if (!supported || !noticeEnabled || !updateAvailable || !latest || dismissed === latest.version) {
        return null;
    }
    return (
        <div className="desktop-update-banner" role="status" data-testid="mobile-update-banner">
            <span>Meadhall {latest.version} is available.</span>
            <a
                className="desktop-update-banner-primary"
                href={latest.downloadUrl ?? latest.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
            >
                {platform === "ios" ? "Open TestFlight" : latest.downloadUrl ? "Download APK" : "Get the update"}
            </a>
            <button type="button" className="desktop-update-banner-dismiss" onClick={onOpenUpdateSettings}>
                How to install
            </button>
            <button
                type="button"
                className="desktop-update-banner-dismiss"
                onClick={() => {
                    dismissUpdateVersion(latest.version);
                    setDismissed(latest.version);
                }}
            >
                Later
            </button>
        </div>
    );
}
