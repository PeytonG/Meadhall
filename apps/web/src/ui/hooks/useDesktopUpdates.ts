// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useState } from "react";

import type { HeorotDesktopUpdateStatus } from "../types/heorotDesktop";
import { logAppError } from "../logs/appLog";

export interface DesktopUpdates {
    // False outside the packaged desktop app (web, mobile, dev builds).
    supported: boolean;
    status: HeorotDesktopUpdateStatus | null;
    appVersion: string | null;
    checkForUpdates: () => void;
    // Downloads the update if needed, then installs it and restarts the app.
    updateNow: () => void;
}

export function useDesktopUpdates(): DesktopUpdates {
    const bridge = typeof window !== "undefined" ? window.heorotDesktop : undefined;
    const [status, setStatus] = useState<HeorotDesktopUpdateStatus | null>(null);
    const [appVersion, setAppVersion] = useState<string | null>(null);

    useEffect(() => {
        if (!bridge?.getUpdateStatus || !bridge.onUpdateStatus) {
            return;
        }
        let cancelled = false;
        void bridge.getUpdateStatus().then((initialStatus) => {
            if (!cancelled) setStatus(initialStatus);
        });
        void bridge.getAppVersion?.().then((version) => {
            if (!cancelled) setAppVersion(version);
        });
        const unsubscribe = bridge.onUpdateStatus((next) => {
            setStatus(next);
            if (next.state === "error") logAppError("updates", next.message);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [bridge]);

    const checkForUpdates = useCallback(() => {
        void bridge?.checkForUpdates?.().then((next) => {
            if (next) setStatus(next);
        });
    }, [bridge]);

    const updateNow = useCallback(() => {
        void bridge?.installUpdate?.();
    }, [bridge]);

    return { supported: status !== null, status, appVersion, checkForUpdates, updateNow };
}
