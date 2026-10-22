import path from "node:path";
import { app, Menu, nativeImage, Tray } from "electron";

interface TrayCallbacks {
    showWindow: () => void;
    quit: () => void;
}

let tray: Tray | null = null;

function resolveTrayIconPath(): string {
    // nativeImage picks up tray@2x.png automatically on HiDPI displays.
    return path.join(app.getAppPath(), "assets", "tray.png");
}

export function hasTray(): boolean {
    return tray !== null && !tray.isDestroyed();
}

export function createTray(title: string, callbacks: TrayCallbacks): void {
    if (hasTray()) {
        return;
    }

    const icon = nativeImage.createFromPath(resolveTrayIconPath());
    if (icon.isEmpty()) {
        console.warn("[heorot-desktop] tray icon missing; close-to-tray disabled");
        return;
    }

    tray = new Tray(icon);
    tray.setToolTip(title);
    tray.setContextMenu(
        Menu.buildFromTemplate([
            { label: `Open ${title}`, click: callbacks.showWindow },
            { type: "separator" },
            { label: "Quit", click: callbacks.quit },
        ]),
    );
    tray.on("click", callbacks.showWindow);
}

export function destroyTray(): void {
    tray?.destroy();
    tray = null;
}
