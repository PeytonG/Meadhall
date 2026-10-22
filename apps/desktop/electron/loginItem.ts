import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

// Launch at login, started hidden in the tray. Electron's login item API covers Windows and macOS;
// Linux uses an XDG autostart entry.

export const START_HIDDEN_ARG = "--hidden";

function getLinuxAutostartPath(): string {
    const configHome = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
    return path.join(configHome, "autostart", "meadhall.desktop");
}

function getLinuxExecutable(): string {
    // AppImage runs from a temporary mount; APPIMAGE is the stable path to the image itself.
    return process.env.APPIMAGE?.trim() || process.execPath;
}

function quoteDesktopExecArg(value: string): string {
    return `"${value.replace(/(["`$\\])/g, "\\$1")}"`;
}

export function getStartAtLogin(): boolean {
    if (process.platform === "linux") {
        return fs.existsSync(getLinuxAutostartPath());
    }
    return app.getLoginItemSettings().openAtLogin;
}

export function setStartAtLogin(enabled: boolean): void {
    if (process.platform === "linux") {
        const autostartPath = getLinuxAutostartPath();
        if (!enabled) {
            fs.rmSync(autostartPath, { force: true });
            return;
        }
        fs.mkdirSync(path.dirname(autostartPath), { recursive: true });
        fs.writeFileSync(
            autostartPath,
            [
                "[Desktop Entry]",
                "Type=Application",
                "Name=Meadhall",
                `Exec=${quoteDesktopExecArg(getLinuxExecutable())} ${START_HIDDEN_ARG}`,
                "X-GNOME-Autostart-enabled=true",
                "",
            ].join("\n"),
            "utf8",
        );
        return;
    }

    app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: enabled,
        args: enabled ? [START_HIDDEN_ARG] : [],
    });
}

export function wasLaunchedHidden(): boolean {
    if (process.argv.includes(START_HIDDEN_ARG)) {
        return true;
    }
    return process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAsHidden;
}
