import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { DesktopUpdateStatus } from "./updater";

// A screen or window that can be shared, with a preview (PNG data URLs) to pick from.
interface DesktopCaptureSource {
    id: string;
    name: string;
    kind: "screen" | "window";
    thumbnail: string | null;
    icon: string | null;
}

export interface HeorotDesktopMediaAuthState {
    accessToken?: string;
    homeserverUrl?: string;
    versions?: string[];
}

export interface HeorotDesktopBridge {
    openExternal: (url: string) => Promise<void>;
    setMediaAuthState: (state: HeorotDesktopMediaAuthState) => Promise<void>;
    clearMediaAuthState: () => Promise<void>;
    setCloseOnWindowCloseMinimize: (enabled: boolean) => Promise<void>;
    // Brings the window back (from the tray too), e.g. when a notification is clicked.
    showWindow: () => Promise<void>;
    // Seconds since the last keyboard or mouse input anywhere on the computer.
    getSystemIdleSeconds: () => Promise<number>;
    // The taskbar icon with an unread bubble (icon is a PNG data URL drawn by the app; count 0 clears it).
    setUnreadBadge: (badge: { count: number; icon: string | null }) => Promise<void>;
    // The game Steam is running, if any.
    getActivity: () => Promise<{ name: string; appId: string; source: "steam" } | null>;
    // The tray menu's Mute / Deafen / Status: the app reports its state and handles the menu's choices.
    setTrayState: (state: { muted: boolean; deafened: boolean; status: string }) => Promise<void>;
    onTrayAction: (listener: (action: { type: string; status?: string }) => void) => () => void;
    // Native OS notification; resolves false if the platform can't show one (then the web API is used).
    showNotification: (payload: { title: string; body: string; roomId?: string; urgent?: boolean }) => Promise<boolean>;
    onNotificationClicked: (listener: (roomId: string) => void) => () => void;
    // Recolors the window-controls overlay (minimize/maximize/close) to match the app theme.
    setTitleBarColors: (colors: { color: string; symbolColor: string }) => Promise<void>;
    quitApp: () => Promise<void>;
    getDesktopCapturerSources: (options?: { previews?: boolean }) => Promise<DesktopCaptureSource[]>;
    setPreferredDisplayMediaSource: (sourceId: string) => Promise<void>;
    getStartAtLogin: () => Promise<boolean>;
    setStartAtLogin: (enabled: boolean) => Promise<boolean>;
    getUpdateStatus: () => Promise<DesktopUpdateStatus | null>;
    onUpdateStatus: (listener: (status: DesktopUpdateStatus) => void) => () => void;
    // Downloads the available update if needed, then installs it and restarts.
    installUpdate: () => Promise<void>;
    // Downloads and installs a specific release (also older ones), then restarts.
    installVersion: (version: string) => Promise<{ ok: boolean; message?: string }>;
    checkForUpdates: () => Promise<DesktopUpdateStatus | null>;
    getAppVersion: () => Promise<string>;
    platform: NodeJS.Platform;
    versions: {
        electron: string;
        chrome: string;
        node: string;
    };
}

const bridge: HeorotDesktopBridge = {
    openExternal: async (url: string): Promise<void> => {
        await ipcRenderer.invoke("heorot:openExternal", url);
    },
    setMediaAuthState: async (state: HeorotDesktopMediaAuthState): Promise<void> => {
        await ipcRenderer.invoke("heorot:setMediaAuthState", state);
    },
    clearMediaAuthState: async (): Promise<void> => {
        await ipcRenderer.invoke("heorot:clearMediaAuthState");
    },
    setCloseOnWindowCloseMinimize: async (enabled: boolean): Promise<void> => {
        await ipcRenderer.invoke("heorot:setCloseOnWindowCloseMinimize", enabled);
    },
    showNotification: async (payload: { title: string; body: string; roomId?: string; urgent?: boolean }): Promise<boolean> => {
        return (await ipcRenderer.invoke("heorot:showNotification", payload)) === true;
    },
    onNotificationClicked: (listener: (roomId: string) => void): (() => void) => {
        const handler = (_event: IpcRendererEvent, roomId: string): void => listener(roomId);
        ipcRenderer.on("heorot:notificationClicked", handler);
        return () => {
            ipcRenderer.removeListener("heorot:notificationClicked", handler);
        };
    },
    showWindow: async (): Promise<void> => {
        await ipcRenderer.invoke("heorot:showWindow");
    },
    getSystemIdleSeconds: async (): Promise<number> => ipcRenderer.invoke("heorot:getSystemIdleSeconds"),
    getActivity: async (): Promise<{ name: string; appId: string; source: "steam" } | null> => ipcRenderer.invoke("heorot:getActivity"),
    setUnreadBadge: async (badge: { count: number; icon: string | null }): Promise<void> => {
        await ipcRenderer.invoke("heorot:setUnreadBadge", badge);
    },
    setTrayState: async (state: { muted: boolean; deafened: boolean; status: string }): Promise<void> => {
        await ipcRenderer.invoke("heorot:setTrayState", state);
    },
    onTrayAction: (listener: (action: { type: string; status?: string }) => void): (() => void) => {
        const handler = (_event: unknown, action: { type: string; status?: string }): void => listener(action);
        ipcRenderer.on("heorot:trayAction", handler);
        return () => {
            ipcRenderer.removeListener("heorot:trayAction", handler);
        };
    },
    setTitleBarColors: async (colors: { color: string; symbolColor: string }): Promise<void> => {
        await ipcRenderer.invoke("heorot:setTitleBarColors", colors);
    },
    quitApp: async (): Promise<void> => {
        await ipcRenderer.invoke("heorot:quitApp");
    },
    getDesktopCapturerSources: async (options?: { previews?: boolean }): Promise<DesktopCaptureSource[]> => {
        return (await ipcRenderer.invoke("heorot:getDesktopCapturerSources", { previews: options?.previews !== false })) as DesktopCaptureSource[];
    },
    setPreferredDisplayMediaSource: async (sourceId: string): Promise<void> => {
        await ipcRenderer.invoke("heorot:setPreferredDisplayMediaSource", sourceId);
    },
    getStartAtLogin: async (): Promise<boolean> => {
        return (await ipcRenderer.invoke("heorot:getStartAtLogin")) === true;
    },
    setStartAtLogin: async (enabled: boolean): Promise<boolean> => {
        return (await ipcRenderer.invoke("heorot:setStartAtLogin", enabled)) === true;
    },
    getUpdateStatus: async (): Promise<DesktopUpdateStatus | null> => {
        return (await ipcRenderer.invoke("heorot:getUpdateStatus")) as DesktopUpdateStatus | null;
    },
    onUpdateStatus: (listener: (status: DesktopUpdateStatus) => void): (() => void) => {
        const handler = (_event: IpcRendererEvent, status: DesktopUpdateStatus): void => listener(status);
        ipcRenderer.on("heorot:updateStatus", handler);
        return () => {
            ipcRenderer.removeListener("heorot:updateStatus", handler);
        };
    },
    installUpdate: async (): Promise<void> => {
        await ipcRenderer.invoke("heorot:installUpdate");
    },
    installVersion: async (version: string): Promise<{ ok: boolean; message?: string }> =>
        (await ipcRenderer.invoke("heorot:installVersion", version)) as { ok: boolean; message?: string },
    checkForUpdates: async (): Promise<DesktopUpdateStatus | null> => {
        return (await ipcRenderer.invoke("heorot:checkForUpdates")) as DesktopUpdateStatus | null;
    },
    getAppVersion: async (): Promise<string> => {
        return String(await ipcRenderer.invoke("heorot:getAppVersion"));
    },
    platform: process.platform,
    versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
    },
};

contextBridge.exposeInMainWorld("heorotDesktop", bridge);
