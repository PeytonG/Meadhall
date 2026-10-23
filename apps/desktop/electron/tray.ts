// SPDX-License-Identifier: AGPL-3.0-only
import path from "node:path";
import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";

// What the tray menu shows, reported by the app (heorot:setTrayState) whenever it changes.
export interface TrayState {
    muted: boolean;
    deafened: boolean;
    status: TrayStatus;
}

export type TrayStatus = "auto" | "online" | "idle" | "dnd" | "invisible";

export type TrayAction = { type: "toggleMute" } | { type: "toggleDeafen" } | { type: "setStatus"; status: TrayStatus };

interface TrayCallbacks {
    showWindow: () => void;
    quit: () => void;
    // Sends a menu choice to the app, which owns mute/deafen and status.
    action: (action: TrayAction) => void;
}

const STATUSES: ReadonlyArray<{ status: TrayStatus; label: string }> = [
    { status: "auto", label: "Automatic" },
    { status: "online", label: "Online" },
    { status: "idle", label: "Away" },
    { status: "dnd", label: "Do Not Disturb" },
    { status: "invisible", label: "Invisible" },
];

let tray: Tray | null = null;
let trayTitle = "";
let trayCallbacks: TrayCallbacks | null = null;
let trayState: TrayState = { muted: false, deafened: false, status: "auto" };

function resolveTrayIconPath(): string {
    // nativeImage picks up tray@2x.png automatically on HiDPI displays.
    return path.join(app.getAppPath(), "assets", "tray.png");
}

export function hasTray(): boolean {
    return tray !== null && !tray.isDestroyed();
}

// Like Discord's tray: mute, deafen and status without opening the window.
export function trayMenuTemplate(title: string, state: TrayState, callbacks: TrayCallbacks): MenuItemConstructorOptions[] {
    return [
        { label: `Open ${title}`, click: callbacks.showWindow },
        { type: "separator" },
        { label: "Mute", type: "checkbox", checked: state.muted, click: () => callbacks.action({ type: "toggleMute" }) },
        { label: "Deafen", type: "checkbox", checked: state.deafened, click: () => callbacks.action({ type: "toggleDeafen" }) },
        { type: "separator" },
        {
            label: "Status",
            submenu: STATUSES.map(({ status, label }) => ({
                label,
                type: "radio" as const,
                checked: state.status === status,
                click: () => callbacks.action({ type: "setStatus", status }),
            })),
        },
        { type: "separator" },
        { label: "Quit", click: callbacks.quit },
    ];
}

function rebuildMenu(): void {
    if (!tray || tray.isDestroyed() || !trayCallbacks) {
        return;
    }
    const menu = Menu.buildFromTemplate(trayMenuTemplate(trayTitle, trayState, trayCallbacks));
    tray.setContextMenu(menu);
    // Electron can't list a tray's menu, so the desktop tests reach it here to click its items.
    (globalThis as { meadhallTrayMenu?: Menu }).meadhallTrayMenu = menu;
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
    trayTitle = title;
    trayCallbacks = callbacks;
    tray.setToolTip(title);
    rebuildMenu();
    tray.on("click", callbacks.showWindow);
}

export function setTrayState(state: TrayState): void {
    trayState = state;
    rebuildMenu();
}

export function getTrayState(): TrayState {
    return trayState;
}

export function destroyTray(): void {
    tray?.destroy();
    tray = null;
}
