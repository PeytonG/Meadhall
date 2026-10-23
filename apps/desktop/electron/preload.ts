import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { DesktopUpdateStatus } from "./updater";

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
    // Native OS notification; resolves false if the platform can't show one (then the web API is used).
    showNotification: (payload: { title: string; body: string; roomId?: string; urgent?: boolean }) => Promise<boolean>;
    onNotificationClicked: (listener: (roomId: string) => void) => () => void;
    // Recolors the window-controls overlay (minimize/maximize/close) to match the app theme.
    setTitleBarColors: (colors: { color: string; symbolColor: string }) => Promise<void>;
    quitApp: () => Promise<void>;
    getDesktopCapturerSources: () => Promise<Array<{ id: string; name: string }>>;
    setPreferredDisplayMediaSource: (sourceId: string) => Promise<void>;
    getStartAtLogin: () => Promise<boolean>;
    setStartAtLogin: (enabled: boolean) => Promise<boolean>;
    getUpdateStatus: () => Promise<DesktopUpdateStatus | null>;
    onUpdateStatus: (listener: (status: DesktopUpdateStatus) => void) => () => void;
    // Downloads the available update if needed, then installs it and restarts.
    installUpdate: () => Promise<void>;
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
    setTitleBarColors: async (colors: { color: string; symbolColor: string }): Promise<void> => {
        await ipcRenderer.invoke("heorot:setTitleBarColors", colors);
    },
    quitApp: async (): Promise<void> => {
        await ipcRenderer.invoke("heorot:quitApp");
    },
    getDesktopCapturerSources: async (): Promise<Array<{ id: string; name: string }>> => {
        return (await ipcRenderer.invoke("heorot:getDesktopCapturerSources")) as Array<{ id: string; name: string }>;
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
