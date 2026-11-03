// SPDX-License-Identifier: AGPL-3.0-only
// The game overlay (Shift+`), like Discord's: a transparent, always-on-top window over the screen you're on, with the
// call's controls, who's in it and talking, and recent messages. The main window keeps the call and the Matrix client;
// it sends the overlay a snapshot of what to show, and the overlay sends back what was clicked.
//
// Works over windowed and borderless-fullscreen games. Exclusive-fullscreen games draw over everything else and would
// need injecting into the game (as Discord does), which anti-cheat systems can ban for, so Meadhall doesn't.
import { BrowserWindow, globalShortcut, screen } from "electron";

// Shift+` like Discord; if another app already has it, the next free one.
export const OVERLAY_SHORTCUTS = ["Shift+`", "Ctrl+Shift+`", "Shift+F10"];
let activeShortcut: string | null = null;

export function overlayShortcut(): string | null {
    return activeShortcut;
}

let overlay: BrowserWindow | null = null;
let lastState: unknown = null;
// Widgets pinned in the overlay stay on screen while you play, click-through, like Discord's pinned widgets.
let hasPinned = false;
let mode: "open" | "pinned" | "hidden" = "hidden";

function setMode(next: "open" | "pinned" | "hidden"): void {
    mode = next;
    if (!overlay || overlay.isDestroyed()) return;
    if (next === "hidden") {
        overlay.hide();
    } else {
        overlay.setIgnoreMouseEvents(next === "pinned", { forward: true });
        overlay.showInactive();
        if (next === "open") overlay.focus();
    }
    overlay.webContents.send("heorot:overlayMode", next);
}

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
    if (mode === "open") {
        hideOverlay();
        return;
    }
    overlay ??= create();
    if (mode === "hidden") {
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        overlay.setBounds(display.bounds);
    }
    const show = (): void => {
        overlay?.webContents.send("heorot:overlayState", lastState);
        setMode("open");
    };
    if (overlay.webContents.isLoading()) overlay.webContents.once("did-finish-load", show);
    else show();
}

// Closing keeps pinned widgets on screen (click-through); with none pinned the window goes away.
export function hideOverlay(): void {
    setMode(hasPinned ? "pinned" : "hidden");
}

export function setOverlayPinned(pinned: unknown): void {
    hasPinned = pinned === true;
    if (mode === "pinned" && !hasPinned) setMode("hidden");
}

export function overlayMode(): string {
    return mode;
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

const COMMANDS = new Set(["toggleMute", "toggleDeafen", "toggleCamera", "toggleScreenShare", "openSoundboard", "leave", "openApp", "playSound", "setVolume", "sendMessage", "openRoom"]);

// Commands are checked again in the main window (overlay/overlayState.ts parseOverlayCommand).
export function overlayCommand(command: unknown): void {
    const type = typeof command === "string" ? command : (command as { type?: unknown } | null)?.type;
    if (typeof type !== "string" || !COMMANDS.has(type)) return;
    if (JSON.stringify(command).length > 8_000) return;
    const main = options?.mainWindow();
    if (!main) return;
    if (type === "openApp" || type === "toggleScreenShare" || type === "openSoundboard" || type === "openRoom") {
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
    activeShortcut = OVERLAY_SHORTCUTS.find((shortcut) => globalShortcut.register(shortcut, toggleOverlay)) ?? null;
    if (activeShortcut !== OVERLAY_SHORTCUTS[0]) {
        console.warn(`[overlay] ${OVERLAY_SHORTCUTS[0]} is taken by another app; using ${activeShortcut ?? "no shortcut (open it from the voice panel)"}.`);
    }
}

export function tearDownOverlay(): void {
    if (activeShortcut) globalShortcut.unregister(activeShortcut);
    activeShortcut = null;
    overlay?.destroy();
    overlay = null;
}
