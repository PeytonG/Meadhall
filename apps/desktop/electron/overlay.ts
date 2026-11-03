// SPDX-License-Identifier: AGPL-3.0-only
// The game overlay (Shift+`), like Discord's: a transparent, always-on-top window over the screen you're on, with the
// call's controls, who's in it and talking, and recent messages. The main window keeps the call and the Matrix client;
// it sends the overlay a snapshot of what to show, and the overlay sends back what was clicked.
//
// Works over windowed and borderless-fullscreen games. Exclusive-fullscreen games draw over everything else and would
// need injecting into the game (as Discord does), which anti-cheat systems can ban for, so Meadhall doesn't.
import { BrowserWindow, globalShortcut, screen } from "electron";

export const OVERLAY_SHORTCUT = "Shift+`";

let overlay: BrowserWindow | null = null;
let lastState: unknown = null;

interface OverlayOptions {
    preload: string;
    load: (window: BrowserWindow, hash: string) => Promise<void>;
    mainWindow: () => BrowserWindow | null;
    secure: (window: BrowserWindow) => void;
}

let options: OverlayOptions | null = null;

function create(): BrowserWindow {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const window = new BrowserWindow({
        ...display.bounds,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: "#00000000",
        webPreferences: {
            preload: options!.preload,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
            disableBlinkFeatures: "Auxclick",
        },
    });
    window.setAlwaysOnTop(true, "screen-saver");
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    options!.secure(window);
    window.on("closed", () => {
        if (overlay === window) overlay = null;
    });
    void options!.load(window, "overlay");
    return window;
}

export function toggleOverlay(): void {
    if (!options) return;
    if (overlay?.isVisible()) {
        hideOverlay();
        return;
    }
    overlay ??= create();
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    overlay.setBounds(display.bounds);
    const show = (): void => {
        overlay?.show();
        overlay?.focus();
        overlay?.webContents.send("heorot:overlayState", lastState);
    };
    if (overlay.webContents.isLoading()) overlay.webContents.once("did-finish-load", show);
    else show();
}

export function hideOverlay(): void {
    overlay?.hide();
}

export function setOverlayState(state: unknown): void {
    // A snapshot of plain data, kept small.
    if (JSON.stringify(state ?? null).length > 64_000) return;
    lastState = state;
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send("heorot:overlayState", state);
}

export function overlayState(): unknown {
    return lastState;
}

const COMMANDS = new Set(["toggleMute", "toggleDeafen", "toggleCamera", "toggleScreenShare", "openSoundboard", "leave", "openApp"]);

export function overlayCommand(command: unknown): void {
    if (typeof command !== "string" || !COMMANDS.has(command)) return;
    const main = options?.mainWindow();
    if (!main) return;
    if (command === "openApp" || command === "toggleScreenShare" || command === "openSoundboard") {
        hideOverlay();
        if (main.isMinimized()) main.restore();
        main.show();
        main.focus();
    }
    main.webContents.send("heorot:overlayCommand", command);
}

export function isOverlayWindow(window: BrowserWindow | null): boolean {
    return Boolean(window && window === overlay);
}

export function setUpOverlay(setup: OverlayOptions): void {
    options = setup;
    if (!globalShortcut.register(OVERLAY_SHORTCUT, toggleOverlay)) {
        console.warn(`[overlay] ${OVERLAY_SHORTCUT} is taken by another app; the overlay can't open with it.`);
    }
}

export function tearDownOverlay(): void {
    globalShortcut.unregister(OVERLAY_SHORTCUT);
    overlay?.destroy();
    overlay = null;
}
