// SPDX-License-Identifier: AGPL-3.0-only
import { app, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

// Updates are published as GitHub Releases (see "publish" in electron-builder.json).

export type DesktopUpdateStatus =
    | { state: "idle" }
    | { state: "available"; version: string }
    | { state: "downloaded"; version: string }
    | { state: "error"; message: string };

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_STATUS_CHANNEL = "heorot:updateStatus";

let currentStatus: DesktopUpdateStatus = { state: "idle" };
let updaterConfigured = false;

export function getUpdateStatus(): DesktopUpdateStatus {
    return currentStatus;
}

export function isAutoUpdateSupported(): boolean {
    return app.isPackaged && process.env.HEOROT_DISABLE_AUTO_UPDATE !== "1";
}

export function configureAutoUpdater(getWindow: () => BrowserWindow | null): void {
    if (updaterConfigured || !isAutoUpdateSupported()) {
        return;
    }
    updaterConfigured = true;

    const publish = (status: DesktopUpdateStatus): void => {
        currentStatus = status;
        const window = getWindow();
        if (window && !window.isDestroyed()) {
            window.webContents.send(UPDATE_STATUS_CHANNEL, status);
        }
    };

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("update-available", (info) => publish({ state: "available", version: info.version }));
    autoUpdater.on("update-downloaded", (info) => publish({ state: "downloaded", version: info.version }));
    autoUpdater.on("error", (error) => {
        console.warn("[heorot-desktop] auto-update failed:", error);
        if (currentStatus.state !== "downloaded") {
            publish({ state: "error", message: error.message });
        }
    });

    const check = (): void => {
        void autoUpdater.checkForUpdates().catch(() => undefined);
    };
    check();
    setInterval(check, UPDATE_CHECK_INTERVAL_MS).unref?.();
}

// beforeQuit runs only when an install actually proceeds (e.g. to bypass close-to-tray).
export function installDownloadedUpdate(beforeQuit: () => void): void {
    if (currentStatus.state !== "downloaded") {
        return;
    }
    beforeQuit();
    // Silent so the assisted NSIS installer doesn't show its wizard; relaunch once installed.
    autoUpdater.quitAndInstall(true, true);
}
