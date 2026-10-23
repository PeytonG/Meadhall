// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useState } from "react";

import {
    compareVersions,
    currentAppVersion,
    fetchLatestRelease,
    isUpdateNoticeEnabled,
    setUpdateNoticeEnabled,
    type LatestRelease,
} from "../../core/updates/mobileUpdates";
import { currentPlatform } from "../presence/clientStatus";

export interface MobileUpdates {
    // True in the Android/iOS apps.
    supported: boolean;
    platform: "android" | "ios";
    currentVersion: string;
    latest: LatestRelease | null;
    updateAvailable: boolean;
    checking: boolean;
    error: string | null;
    noticeEnabled: boolean;
    setNoticeEnabled: (enabled: boolean) => void;
    check: () => void;
}

function mobilePlatform(): "android" | "ios" | null {
    if (currentPlatform() !== "mobile") return null;
    const platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
    return platform === "ios" ? "ios" : "android";
}

export function useMobileUpdates(): MobileUpdates {
    const [platform] = useState(mobilePlatform);
    const [latest, setLatest] = useState<LatestRelease | null>(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [noticeEnabled, setNoticeEnabledState] = useState(isUpdateNoticeEnabled);
    const currentVersion = currentAppVersion();

    const run = useCallback(
        (force: boolean) => {
            if (!platform) return;
            setChecking(true);
            setError(null);
            void fetchLatestRelease(platform, force)
                .then(setLatest)
                .catch((checkError: unknown) => setError(checkError instanceof Error ? checkError.message : "Couldn't check."))
                .finally(() => setChecking(false));
        },
        [platform],
    );

    useEffect(() => run(false), [run]);

    return {
        supported: platform !== null,
        platform: platform ?? "android",
        currentVersion,
        latest,
        // Development builds don't know their version, so they never nag.
        updateAvailable: Boolean(latest && currentVersion && compareVersions(latest.version, currentVersion) > 0),
        checking,
        error,
        noticeEnabled,
        setNoticeEnabled: (enabled) => {
            setUpdateNoticeEnabled(enabled);
            setNoticeEnabledState(enabled);
        },
        check: () => run(true),
    };
}
