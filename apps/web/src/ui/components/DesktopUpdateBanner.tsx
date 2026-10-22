import React, { useEffect, useState } from "react";

import type { HeorotDesktopUpdateStatus } from "../types/heorotDesktop";

// Shown only in the desktop app once electron-updater has downloaded a new release.
export function DesktopUpdateBanner(): React.ReactElement | null {
    const [status, setStatus] = useState<HeorotDesktopUpdateStatus | null>(null);
    const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        const bridge = typeof window !== "undefined" ? window.heorotDesktop : undefined;
        if (!bridge?.getUpdateStatus || !bridge.onUpdateStatus) {
            return;
        }

        let cancelled = false;
        void bridge.getUpdateStatus().then((initialStatus) => {
            if (!cancelled) {
                setStatus(initialStatus);
            }
        });
        const unsubscribe = bridge.onUpdateStatus(setStatus);
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    if (status?.state !== "downloaded" || dismissedVersion === status.version) {
        return null;
    }

    return (
        <div className="desktop-update-banner" role="status">
            <span>Version {status.version} is ready to install.</span>
            <button
                type="button"
                className="desktop-update-banner-primary"
                disabled={installing}
                onClick={() => {
                    setInstalling(true);
                    void window.heorotDesktop?.installUpdate?.();
                }}
            >
                {installing ? "Restarting..." : "Restart to update"}
            </button>
            <button type="button" className="desktop-update-banner-dismiss" onClick={() => setDismissedVersion(status.version)}>
                Later
            </button>
        </div>
    );
}
