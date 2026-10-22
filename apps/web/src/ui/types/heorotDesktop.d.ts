export interface HeorotDesktopMediaAuthState {
    accessToken?: string;
    homeserverUrl?: string;
    versions?: string[];
}

export interface HeorotDesktopCaptureSource {
    id: string;
    name: string;
}

export type HeorotDesktopUpdateStatus =
    | { state: "idle" }
    | { state: "available"; version: string }
    | { state: "downloaded"; version: string }
    | { state: "error"; message: string };

export interface HeorotDesktopBridge {
    openExternal?: (url: string) => Promise<void>;
    setMediaAuthState?: (state: HeorotDesktopMediaAuthState) => Promise<void>;
    clearMediaAuthState?: () => Promise<void>;
    setCloseOnWindowCloseMinimize?: (enabled: boolean) => Promise<void>;
    quitApp?: () => Promise<void>;
    getDesktopCapturerSources?: () => Promise<HeorotDesktopCaptureSource[]>;
    setPreferredDisplayMediaSource?: (sourceId: string) => Promise<void>;
    getStartAtLogin?: () => Promise<boolean>;
    setStartAtLogin?: (enabled: boolean) => Promise<boolean>;
    getUpdateStatus?: () => Promise<HeorotDesktopUpdateStatus | null>;
    onUpdateStatus?: (listener: (status: HeorotDesktopUpdateStatus) => void) => () => void;
    installUpdate?: () => Promise<void>;
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
