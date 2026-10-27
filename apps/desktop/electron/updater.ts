// SPDX-License-Identifier: AGPL-3.0-only
import { app, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

import { installLinuxPackage, linuxPackageType } from "./linuxPackage";

// Updates are published as GitHub Releases (see "publish" in electron-builder.json). Nothing is downloaded until
// the user clicks "Update now"; the update is then downloaded, installed and the app restarted.

export type DesktopUpdateStatus =
    | { state: "idle" }
    | { state: "checking" }
    | { state: "up-to-date"; currentVersion: string }
    | { state: "available"; version: string }
    | { state: "downloading"; version: string; percent: number }
    | { state: "downloaded"; version: string }
    | { state: "error"; message: string };

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_STATUS_CHANNEL = "heorot:updateStatus";

let currentStatus: DesktopUpdateStatus = { state: "idle" };
let updaterConfigured = false;
let installWhenDownloaded: (() => void) | null = null;
let publish: (status: DesktopUpdateStatus) => void = () => undefined;

export function getUpdateStatus(): DesktopUpdateStatus {
    return currentStatus;
}

// Flatpak (Flathub) and Snap installs are updated by their store, never by Meadhall itself.
export function isAutoUpdateSupported(): boolean {
    if (process.env.FLATPAK_ID || process.env.SNAP) return false;
    return app.isPackaged && process.env.HEOROT_DISABLE_AUTO_UPDATE !== "1";
}

// The downloaded update file (for .rpm/.deb installs, which Meadhall runs itself; see linuxPackage.ts).
let downloadedFile: string | null = null;

function install(beforeQuit: () => void): void {
    const packageType = linuxPackageType();
    if (packageType && downloadedFile) {
        const version = "version" in currentStatus ? currentStatus.version : "";
        void installLinuxPackage(packageType, downloadedFile)
            .then(() => {
                beforeQuit();
                app.relaunch();
                app.exit(0);
            })
            .catch((error: unknown) => publish({ state: "error", message: error instanceof Error ? error.message : String(error) }))
            .finally(() => {
                if (currentStatus.state !== "error") publish({ state: "downloaded", version });
            });
        return;
    }
    beforeQuit();
    // Silent so the assisted NSIS installer doesn't show its wizard; relaunch once installed.
    autoUpdater.quitAndInstall(true, true);
}

export function configureAutoUpdater(getWindow: () => BrowserWindow | null): void {
    if (updaterConfigured || !isAutoUpdateSupported()) {
        return;
    }
    updaterConfigured = true;

    publish = (status: DesktopUpdateStatus): void => {
        currentStatus = status;
        const window = getWindow();
        if (window && !window.isDestroyed()) {
            window.webContents.send(UPDATE_STATUS_CHANNEL, status);
        }
    };

    autoUpdater.autoDownload = false;
    // An update the user started downloading but didn't restart for still installs on the next quit (except .rpm/.deb,
    // which need the password prompt and are installed by Meadhall itself).
    autoUpdater.autoInstallOnAppQuit = linuxPackageType() === null;
    autoUpdater.on("checking-for-update", () => publish({ state: "checking" }));
    autoUpdater.on("update-not-available", () => publish({ state: "up-to-date", currentVersion: app.getVersion() }));
    autoUpdater.on("update-available", (info) => publish({ state: "available", version: info.version }));
    autoUpdater.on("download-progress", (progress) => {
        const version = "version" in currentStatus ? currentStatus.version : "";
        publish({ state: "downloading", version, percent: Math.round(progress.percent) });
    });
    autoUpdater.on("update-downloaded", (info) => {
        downloadedFile = (info as { downloadedFile?: string }).downloadedFile ?? null;
        publish({ state: "downloaded", version: info.version });
        const pendingInstall = installWhenDownloaded;
        installWhenDownloaded = null;
        if (pendingInstall) {
            install(pendingInstall);
        }
    });
    autoUpdater.on("error", (error) => {
        console.warn("[heorot-desktop] auto-update failed:", error);
        installWhenDownloaded = null;
        publish({ state: "error", message: error.message });
    });

    void checkForUpdates();
    setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS).unref?.();
}

export async function checkForUpdates(): Promise<DesktopUpdateStatus> {
    if (!updaterConfigured) {
        return currentStatus;
    }
    // Don't interrupt a download or forget a ready update.
    if (currentStatus.state === "downloading" || currentStatus.state === "downloaded") {
        return currentStatus;
    }
    try {
        await autoUpdater.checkForUpdates();
    } catch {
        // Reported through the "error" event.
    }
    return currentStatus;
}

// "Update now": downloads the update if needed, then installs it and restarts. beforeQuit runs only when the
// install actually proceeds (e.g. to bypass close-to-tray).
export function downloadAndInstallUpdate(beforeQuit: () => void): void {
    if (currentStatus.state === "downloaded") {
        install(beforeQuit);
        return;
    }
    if (currentStatus.state !== "available" && currentStatus.state !== "error") {
        return;
    }
    installWhenDownloaded = beforeQuit;
    if (currentStatus.state === "available") {
        publish({ state: "downloading", version: currentStatus.version, percent: 0 });
    }
    void autoUpdater.downloadUpdate().catch(() => undefined);
}

// "Install an earlier version" (Settings → Updates): point the updater at that release's own update file
// (latest.yml / latest-linux.yml, attached to every release) with downgrades allowed, then download, install and
// restart as usual. Only plain x.y.z versions are accepted, and only from this project's GitHub releases.
const RELEASES_DOWNLOAD = "https://github.com/PeytonG/Meadhall/releases/download";

export function isValidReleaseVersion(version: unknown): version is string {
    return typeof version === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version);
}

export async function installVersion(version: unknown, beforeQuit: () => void): Promise<{ ok: boolean; message?: string }> {
    if (!isValidReleaseVersion(version)) {
        return { ok: false, message: "That isn't a Meadhall version." };
    }
    if (!updaterConfigured) {
        return { ok: false, message: "Installing other versions works in the installed app only." };
    }
    if (currentStatus.state === "downloading") {
        return { ok: false, message: "An update is already downloading." };
    }
    autoUpdater.allowDowngrade = true;
    autoUpdater.setFeedURL({ provider: "generic", url: `${RELEASES_DOWNLOAD}/v${version}` });
    try {
        const result = await autoUpdater.checkForUpdates();
        if (!result || result.updateInfo.version !== version) {
            throw new Error(`Couldn't find Meadhall ${version}.`);
        }
        installWhenDownloaded = beforeQuit;
        publish({ state: "downloading", version, percent: 0 });
        await autoUpdater.downloadUpdate();
        return { ok: true };
    } catch (error) {
        // Back to normal updates from the latest release.
        autoUpdater.allowDowngrade = false;
        autoUpdater.setFeedURL({ provider: "github", owner: "PeytonG", repo: "Meadhall" });
        installWhenDownloaded = null;
        const message = error instanceof Error ? error.message : String(error);
        publish({ state: "error", message });
        return { ok: false, message };
    }
}
