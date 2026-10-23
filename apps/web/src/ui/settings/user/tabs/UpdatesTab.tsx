// SPDX-License-Identifier: AGPL-3.0-only
import React from "react";

import { useDesktopUpdates } from "../../../hooks/useDesktopUpdates";
import { useMobileUpdates } from "../../../hooks/useMobileUpdates";
import { RELEASES_PAGE } from "../../../../core/updates/mobileUpdates";
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

// Phones: the app can't install updates itself, so it shows what's new, links to the release and explains how
// to install it, with a switch for the update notice.
function MobileUpdates(): React.ReactElement {
    const updates = useMobileUpdates();
    const { latest } = updates;
    let statusText = "Checking for updates…";
    if (updates.error) statusText = `Couldn't check for updates: ${updates.error}`;
    else if (latest && updates.updateAvailable) statusText = `Meadhall ${latest.version} is available.`;
    else if (latest) statusText = `You're on the latest version (${latest.version}).`;
    return (
        <div className="settings-tab">
            <h2 className="settings-tab-title">Updates</h2>
            <p className="settings-tab-description">
                The phone app is installed from Meadhall&apos;s GitHub releases, so updates are installed the same way.
            </p>

            <div className="settings-section-card" data-testid="mobile-updates">
                <h3>Meadhall {updates.currentVersion || "(development build)"}</h3>
                <p className="settings-updates-status" role="status">
                    {updates.checking ? "Checking for updates…" : statusText}
                </p>
                <div className="settings-theme-row">
                    {latest ? (
                        <a className="settings-button" href={latest.downloadUrl ?? latest.pageUrl} target="_blank" rel="noopener noreferrer">
                            {updates.platform === "ios" ? "Open TestFlight" : latest.downloadUrl ? `Download APK ${latest.version}` : "Open the latest release"}
                        </a>
                    ) : null}
                    <button type="button" className="settings-button settings-button-secondary" onClick={updates.check} disabled={updates.checking}>
                        Check for updates
                    </button>
                </div>
                <label className="settings-toggle">
                    <input
                        type="checkbox"
                        checked={updates.noticeEnabled}
                        onChange={(event) => updates.setNoticeEnabled(event.target.checked)}
                        data-testid="mobile-update-notice-toggle"
                    />
                    Tell me when a new version is out
                </label>
            </div>

            <div className="settings-section-card">
                <h3>How to install an update</h3>
                {updates.platform === "android" ? (
                    <ol className="settings-steps">
                        <li>Tap <strong>Download APK</strong> above (or open the latest release and download the <code>.apk</code>).</li>
                        <li>Open the downloaded file. If Android asks, allow your browser or Files app to <strong>install unknown apps</strong>.</li>
                        <li>Tap <strong>Update</strong>. Your messages, settings and sign-in stay as they are.</li>
                    </ol>
                ) : (
                    <ol className="settings-steps">
                        <li>The iOS app is in <strong>beta</strong> and comes through Apple&apos;s <strong>TestFlight</strong> app.</li>
                        <li>Tap <strong>Open TestFlight</strong> above, then <strong>Update</strong> next to Meadhall.</li>
                        <li>Your messages, settings and sign-in stay as they are.</li>
                    </ol>
                )}
                <p className="settings-field-help">
                    All releases: <a href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer">{RELEASES_PAGE.replace("https://", "")}</a>
                </p>
            </div>
        </div>
    );
}

export function UpdatesTab(): React.ReactElement {
    const mobile = useMobileUpdates();
    return mobile.supported ? <MobileUpdates /> : <DesktopUpdates />;
}

function DesktopUpdates(): React.ReactElement {
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
