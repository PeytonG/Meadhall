export interface HeorotDesktopMediaAuthState {
    accessToken?: string;
    homeserverUrl?: string;
    versions?: string[];
}

export interface HeorotDesktopCaptureSource {
    id: string;
    name: string;
    // Older desktop apps send only id and name.
    kind?: "screen" | "window";
    thumbnail?: string | null;
    icon?: string | null;
}

// Mirrors DesktopUpdateStatus in apps/desktop/electron/updater.ts.
export type HeorotDesktopUpdateStatus =
    | { state: "idle" }
    | { state: "checking" }
    | { state: "up-to-date"; currentVersion: string }
    | { state: "available"; version: string }
    | { state: "downloading"; version: string; percent: number }
    | { state: "downloaded"; version: string }
    | { state: "error"; message: string };

export interface HeorotDesktopBridge {
    openExternal?: (url: string) => Promise<void>;
    setMediaAuthState?: (state: HeorotDesktopMediaAuthState) => Promise<void>;
    clearMediaAuthState?: () => Promise<void>;
    setCloseOnWindowCloseMinimize?: (enabled: boolean) => Promise<void>;
    showWindow?: () => Promise<void>;
    getSystemIdleSeconds?: () => Promise<number>;
    getActivity?: () => Promise<{ name: string; appId: string; source: "steam" } | null>;
    setUnreadBadge?: (badge: { count: number; icon: string | null }) => Promise<void>;
    setTrayState?: (state: { muted: boolean; deafened: boolean; status: string }) => Promise<void>;
    onTrayAction?: (listener: (action: { type: string; status?: string }) => void) => () => void;
    showNotification?: (payload: { title: string; body: string; roomId?: string; urgent?: boolean }) => Promise<boolean>;
    onNotificationClicked?: (listener: (roomId: string) => void) => () => void;
    setTitleBarColors?: (colors: { color: string; symbolColor: string }) => Promise<void>;
    quitApp?: () => Promise<void>;
    getDesktopCapturerSources?: () => Promise<HeorotDesktopCaptureSource[]>;
    setPreferredDisplayMediaSource?: (sourceId: string) => Promise<void>;
    getStartAtLogin?: () => Promise<boolean>;
    setStartAtLogin?: (enabled: boolean) => Promise<boolean>;
    getUpdateStatus?: () => Promise<HeorotDesktopUpdateStatus | null>;
    onUpdateStatus?: (listener: (status: HeorotDesktopUpdateStatus) => void) => () => void;
    // Downloads the available update if needed, then installs it and restarts.
    installUpdate?: () => Promise<void>;
    installVersion?: (version: string) => Promise<{ ok: boolean; message?: string }>;
    checkForUpdates?: () => Promise<HeorotDesktopUpdateStatus | null>;
    getAppVersion?: () => Promise<string>;
    platform?: string;
    versions?: {
        electron?: string;
        chrome?: string;
        node?: string;
    };
}

declare global {
    interface Window {
        heorotDesktop?: HeorotDesktopBridge;
    }
}
