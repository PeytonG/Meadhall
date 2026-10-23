import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage, type IpcMainInvokeEvent, net, Notification, powerMonitor, protocol, session } from "electron";

import { getStartAtLogin, setStartAtLogin, wasLaunchedHidden } from "./loginItem";
import { configurePermissionHandlers } from "./permissions";
import { currentActivity } from "./steamActivity";
import { createTray, destroyTray, getTrayState, hasTray, setTrayState, type TrayState } from "./tray";
import { checkForUpdates, configureAutoUpdater, downloadAndInstallUpdate, getUpdateStatus, installVersion, isAutoUpdateSupported } from "./updater";
import { openExternalSafely, readWindowState, writeWindowState } from "./util";

const APP_TITLE = "Meadhall";
const DEFAULT_DEV_URL = "http://127.0.0.1:5173";
const DEV_URL = process.env.HEOROT_DESKTOP_DEV_URL?.trim()
    || (process.env.HEOROT_DESKTOP_DEV === "1" ? DEFAULT_DEV_URL : undefined);
const APP_PROTOCOL = "heorot";
const APP_PROTOCOL_HOST = "app";
const APP_ENTRY_URL = `${APP_PROTOCOL}://${APP_PROTOCOL_HOST}/index.html`;
const SYSTEM_AUDIO_CAPTURE_MODE_ENV = process.env.HEOROT_DESKTOP_SYSTEM_AUDIO_CAPTURE_MODE?.trim().toLowerCase();
const SYSTEM_AUDIO_CAPTURE_MODE: "loopback" | "loopbackWithMute" =
    SYSTEM_AUDIO_CAPTURE_MODE_ENV === "loopbackwithmute" ? "loopbackWithMute" : "loopback";
const WINDOW_BACKGROUND_COLOR = "#0e141b";
const TITLEBAR_OVERLAY_COLOR = "#121a23";
const TITLEBAR_OVERLAY_SYMBOL_COLOR = "#e6edf3";
const TITLEBAR_OVERLAY_HEIGHT = 32;
let mainWindow: BrowserWindow | null = null;
let mediaAuthInterceptorConfigured = false;
let appProtocolConfigured = false;
let closeOnWindowCloseMinimize = true;
let isAppQuitting = false;
let preferredDisplayMediaSourceId: string | null = null;

// Automated UI tests run the app with a throwaway profile so they never touch a real sign-in.
if (process.env.MEADHALL_USER_DATA_DIR) {
    app.setPath("userData", process.env.MEADHALL_USER_DATA_DIR);
}

protocol.registerSchemesAsPrivileged([
    {
        scheme: APP_PROTOCOL,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            allowServiceWorkers: true,
        },
    },
]);

interface DesktopMediaAuthState {
    accessToken?: string;
    homeserverUrl?: string;
    versions?: string[];
}

const mediaAuthState: DesktopMediaAuthState = {};

function clearMediaAuthState(): void {
    mediaAuthState.accessToken = undefined;
    mediaAuthState.homeserverUrl = undefined;
    mediaAuthState.versions = undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const filtered = value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    return filtered.length > 0 ? filtered : undefined;
}

function setMediaAuthState(rawState: unknown): void {
    if (!rawState || typeof rawState !== "object") {
        clearMediaAuthState();
        return;
    }

    const value = rawState as {
        accessToken?: unknown;
        homeserverUrl?: unknown;
        versions?: unknown;
    };

    mediaAuthState.accessToken =
        typeof value.accessToken === "string" && value.accessToken.length > 0 ? value.accessToken : undefined;
    mediaAuthState.homeserverUrl =
        typeof value.homeserverUrl === "string" && value.homeserverUrl.length > 0 ? value.homeserverUrl : undefined;
    mediaAuthState.versions = normalizeStringArray(value.versions);
}

function serverSupportsAuthenticatedMedia(): boolean {
    return Boolean(mediaAuthState.versions?.includes("v1.11"));
}

function isV3MediaPath(pathname: string): boolean {
    return pathname.startsWith("/_matrix/media/v3/download") || pathname.startsWith("/_matrix/media/v3/thumbnail");
}

function isAuthenticatedMediaPath(pathname: string): boolean {
    return pathname.startsWith("/_matrix/client/v1/media");
}

function isHomeserverOriginMatch(target: URL): boolean {
    if (!mediaAuthState.homeserverUrl) {
        return false;
    }

    try {
        return target.origin === new URL(mediaAuthState.homeserverUrl).origin;
    } catch {
        return false;
    }
}

function rewriteV3ToAuthenticatedMediaUrl(rawUrl: string): string {
    const url = new URL(rawUrl);
    url.pathname = url.pathname.replace("/_matrix/media/v3/", "/_matrix/client/v1/media/");
    url.searchParams.set("allow_redirect", "true");
    return url.toString();
}

function configureMediaAuthInterceptor(): void {
    if (mediaAuthInterceptorConfigured) {
        return;
    }
    mediaAuthInterceptorConfigured = true;

    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        try {
            const url = new URL(details.url);

            if (!isV3MediaPath(url.pathname)) {
                callback({});
                return;
            }

            if (!isHomeserverOriginMatch(url)) {
                callback({});
                return;
            }

            if (!serverSupportsAuthenticatedMedia() || !mediaAuthState.accessToken) {
                callback({});
                return;
            }

            callback({ redirectURL: rewriteV3ToAuthenticatedMediaUrl(details.url) });
        } catch {
            callback({});
        }
    });

    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        try {
            const url = new URL(details.url);
            if (!isAuthenticatedMediaPath(url.pathname) || !isHomeserverOriginMatch(url) || !mediaAuthState.accessToken) {
                callback({});
                return;
            }

            callback({
                requestHeaders: {
                    ...details.requestHeaders,
                    Authorization: `Bearer ${mediaAuthState.accessToken}`,
                },
            });
        } catch {
            callback({});
        }
    });
}

function configureDisplayMediaCapture(): void {
    session.defaultSession.setDisplayMediaRequestHandler(
        async (request, callback) => {
            try {
                const sources = await desktopCapturer.getSources({
                    types: ["screen", "window"],
                    fetchWindowIcons: true,
                    thumbnailSize: { width: 320, height: 180 },
                });
                const selectedSource =
                    (preferredDisplayMediaSourceId
                        ? sources.find((source) => source.id === preferredDisplayMediaSourceId)
                        : undefined)
                    ?? sources.find((source) => source.id.startsWith("window:"))
                    ?? sources.find((source) => source.id.startsWith("screen:"))
                    ?? sources[0];
                preferredDisplayMediaSourceId = null;

                if (!selectedSource) {
                    callback({});
                    return;
                }

                if (request.audioRequested && process.platform === "win32" && selectedSource.id.startsWith("screen:")) {
                    callback({
                        video: selectedSource,
                        audio: SYSTEM_AUDIO_CAPTURE_MODE,
                    });
                    return;
                }

                callback({ video: selectedSource });
            } catch {
                preferredDisplayMediaSourceId = null;
                callback({});
            }
        },
        { useSystemPicker: true },
    );
}

function resolvePreloadPath(): string {
    return path.join(__dirname, "preload.js");
}

function resolveAppIconPath(): string {
    return path.join(app.getAppPath(), "assets", "icon.png");
}

function resolveRendererRootPath(): string {
    const appPath = app.getAppPath();
    const asarWebPath = path.join(appPath, "web");

    if (fs.existsSync(asarWebPath)) {
        return asarWebPath;
    }

    return path.resolve(__dirname, "../../web");
}

function resolveRendererPath(): string {
    return path.join(resolveRendererRootPath(), "index.html");
}

function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedTarget = path.resolve(targetPath);

    if (process.platform === "win32") {
        const lowerRoot = resolvedRoot.toLowerCase();
        const lowerTarget = resolvedTarget.toLowerCase();
        return lowerTarget === lowerRoot || lowerTarget.startsWith(`${lowerRoot}${path.sep}`);
    }

    return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function configureAppProtocol(): void {
    if (appProtocolConfigured || DEV_URL) {
        return;
    }
    appProtocolConfigured = true;

    protocol.handle(APP_PROTOCOL, async (request) => {
        try {
            const requestUrl = new URL(request.url);
            if (requestUrl.host !== APP_PROTOCOL_HOST) {
                return new Response("Not found", { status: 404 });
            }

            const rootPath = resolveRendererRootPath();
            const decodedPath = decodeURIComponent(requestUrl.pathname);
            const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
            const normalizedRelativePath = path.normalize(relativePath);

            if (normalizedRelativePath.startsWith("..") || path.isAbsolute(normalizedRelativePath)) {
                return new Response("Not found", { status: 404 });
            }

            const targetPath = path.join(rootPath, normalizedRelativePath);
            if (!isPathInsideRoot(rootPath, targetPath)) {
                return new Response("Not found", { status: 404 });
            }

            if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
                return new Response("Not found", { status: 404 });
            }

            return net.fetch(pathToFileURL(targetPath).toString());
        } catch {
            return new Response("Not found", { status: 404 });
        }
    });
}

function canNavigateInsideApp(rawUrl: string): boolean {
    try {
        const target = new URL(rawUrl);

        if (DEV_URL) {
            const devOrigin = new URL(DEV_URL).origin;
            return target.origin === devOrigin;
        }

        return target.protocol === `${APP_PROTOCOL}:` && target.host === APP_PROTOCOL_HOST;
    } catch {
        return false;
    }
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
    if (DEV_URL) {
        await window.loadURL(DEV_URL);
        return;
    }

    await window.loadURL(APP_ENTRY_URL);
}

function configureNavigationSafety(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(({ url }) => {
        void openExternalSafely(url);
        return { action: "deny" };
    });

    window.webContents.on("will-navigate", (event, targetUrl) => {
        if (canNavigateInsideApp(targetUrl)) {
            return;
        }

        event.preventDefault();
        void openExternalSafely(targetUrl);
    });
}

function createMainWindow(startHidden = false): BrowserWindow {
    const windowState = readWindowState();

    const window = new BrowserWindow({
        title: APP_TITLE,
        width: windowState.width,
        height: windowState.height,
        x: windowState.x,
        y: windowState.y,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: WINDOW_BACKGROUND_COLOR,
        // The window's own icon, for the taskbar and window switcher. Without it Windows falls back to whatever it
        // can match the window to, and after some updates (or when started another way) the taskbar button was blank.
        icon: resolveAppIconPath(),
        show: false,
        titleBarStyle: "hidden",
        titleBarOverlay: {
            color: TITLEBAR_OVERLAY_COLOR,
            symbolColor: TITLEBAR_OVERLAY_SYMBOL_COLOR,
            height: TITLEBAR_OVERLAY_HEIGHT,
        },
        webPreferences: {
            preload: resolvePreloadPath(),
            // Incoming-call ringtones and message sounds must play even before anyone has clicked in the window
            // (e.g. the app started hidden at login).
            autoplayPolicy: "no-user-gesture-required",
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: true,
            // Keep syncing at full speed while hidden in the tray, so message and call notifications arrive on time.
            backgroundThrottling: false,
            // Hardening (Electronegativity AUXCLICK_JS_CHECK): middle clicks can't script around will-navigate.
            disableBlinkFeatures: "Auxclick",
        },
    });

    configureNavigationSafety(window);

    window.once("ready-to-show", () => {
        if (startHidden && hasTray()) {
            return;
        }
        if (windowState.isMaximized) {
            window.maximize();
        }
        window.show();
    });

    window.on("close", (event) => {
        const shouldKeepRunningOnClose = !isAppQuitting && closeOnWindowCloseMinimize && process.platform !== "darwin";
        if (shouldKeepRunningOnClose && hasTray()) {
            event.preventDefault();
            writeWindowState(window);
            window.hide();
            return;
        }
        if (shouldKeepRunningOnClose && !window.isMinimized()) {
            event.preventDefault();
            window.minimize();
            return;
        }

        writeWindowState(window);
    });

    window.on("closed", () => {
        if (mainWindow === window) {
            mainWindow = null;
        }
    });

    return window;
}

function focusMainWindow(): void {
    if (!mainWindow) {
        return;
    }

    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
        mainWindow.show();
    }

    mainWindow.focus();
}

function quitApp(): void {
    isAppQuitting = true;
    app.quit();
}

// Every IPC handler checks the message came from Meadhall's own page (the app origin, or the dev server): only
// that page should load with the preload, but if anything else ever did (a future web view, a navigation bug),
// it mustn't be able to open links, show notifications, install versions and so on (Electron security checklist:
// validate the sender of all IPC messages).
function isFromApp(event: IpcMainInvokeEvent): boolean {
    const url = event.senderFrame?.url ?? "";
    return canNavigateInsideApp(url) && event.senderFrame === event.sender.mainFrame;
}

function handleFromApp(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
    ipcMain.handle(channel, (event, ...args) => {
        if (!isFromApp(event)) {
            throw new Error(`${channel}: not allowed from ${event.senderFrame?.url ?? "an unknown page"}`);
        }
        return listener(event, ...args);
    });
}

function registerIpc(): void {
    handleFromApp("heorot:openExternal", async (_event, rawUrl: unknown) => {
        if (typeof rawUrl !== "string") {
            return;
        }

        await openExternalSafely(rawUrl);
    });

    handleFromApp("heorot:setMediaAuthState", (_event, rawState: unknown) => {
        setMediaAuthState(rawState);
    });

    handleFromApp("heorot:clearMediaAuthState", () => {
        clearMediaAuthState();
    });

    handleFromApp("heorot:setCloseOnWindowCloseMinimize", (_event, enabled: unknown) => {
        closeOnWindowCloseMinimize = enabled !== false;
    });

    // Native OS notifications (Windows toasts, Linux libnotify): more reliable than the web Notification API in
    // Electron. Clicking one restores the window and tells the app which conversation to open.
    handleFromApp("heorot:showNotification", (event, payload: unknown) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        const value = payload as { title?: unknown; body?: unknown; roomId?: unknown; urgent?: unknown } | null;
        if (!window || !value || typeof value.title !== "string" || !Notification.isSupported()) {
            return false;
        }
        const notification = new Notification({
            title: value.title.slice(0, 200),
            body: typeof value.body === "string" ? value.body.slice(0, 1000) : "",
            silent: true, // the app plays its own sounds
            urgency: value.urgent === true ? "critical" : "normal",
            timeoutType: value.urgent === true ? "never" : "default",
        });
        notification.on("click", () => {
            if (window.isMinimized()) window.restore();
            window.show();
            window.focus();
            if (typeof value.roomId === "string") {
                window.webContents.send("heorot:notificationClicked", value.roomId);
            }
        });
        notification.show();
        return true;
    });

    // Taskbar badge: the app draws its icon with an unread bubble (top-right, like Discord); 0 restores the plain
    // icon. The page's input is checked: a PNG data URL of sane size, and a count.
    handleFromApp("heorot:setUnreadBadge", (event, payload: { count?: unknown; icon?: unknown }) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        const count = typeof payload?.count === "number" && Number.isFinite(payload.count) ? Math.max(0, Math.min(9999, Math.floor(payload.count))) : 0;
        const icon = typeof payload?.icon === "string" && payload.icon.startsWith("data:image/png;base64,") && payload.icon.length < 400_000 ? payload.icon : null;
        if (window && process.platform !== "darwin") {
            const image = count > 0 && icon ? nativeImage.createFromDataURL(icon) : nativeImage.createFromPath(resolveAppIconPath());
            if (!image.isEmpty()) window.setIcon(image);
        }
        // macOS dock and Linux launchers that support it (Unity/KDE).
        app.setBadgeCount(count);
        (globalThis as { meadhallUnreadBadge?: { count: number; icon: string | null } }).meadhallUnreadBadge = { count, icon: count > 0 ? icon : null };
    });

    // The tray menu mirrors mute/deafen and status; the app reports them as they change.
    handleFromApp("heorot:setTrayState", (_event, state: TrayState) => {
        const statuses = ["auto", "online", "idle", "dnd", "invisible"];
        setTrayState({
            muted: state?.muted === true,
            deafened: state?.deafened === true,
            status: statuses.includes(state?.status) ? state.status : "auto",
        });
    });
    handleFromApp("heorot:getTrayState", () => getTrayState());

    // "Playing ..." from Steam (the app polls this when sharing activity is on).
    handleFromApp("heorot:getActivity", () => currentActivity());

    // For automatic Away: input anywhere on the computer counts, not just in Meadhall.
    handleFromApp("heorot:getSystemIdleSeconds", () => powerMonitor.getSystemIdleTime());

    // Clicking a notification brings the window back, even from the tray.
    handleFromApp("heorot:showWindow", (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            return;
        }
        if (window.isMinimized()) {
            window.restore();
        }
        window.show();
        window.focus();
    });

    // The app sends the colors behind the window controls whenever the theme or layout changes.
    handleFromApp("heorot:setTitleBarColors", (event, colors: unknown) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        const value = colors as { color?: unknown; symbolColor?: unknown } | null;
        const isHex = (candidate: unknown): candidate is string =>
            typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate);
        if (!window || !value || !isHex(value.color) || !isHex(value.symbolColor)) {
            return;
        }
        if (process.platform === "win32" || process.platform === "linux") {
            window.setTitleBarOverlay({ color: value.color, symbolColor: value.symbolColor, height: TITLEBAR_OVERLAY_HEIGHT });
        }
        window.setBackgroundColor(value.color);
    });

    handleFromApp("heorot:getDesktopCapturerSources", async () => {
        const sources = await desktopCapturer.getSources({
            types: ["window", "screen"],
            fetchWindowIcons: true,
            thumbnailSize: { width: 320, height: 180 },
        });
        // Small previews (and the app's icon for windows) so people can see what they're about to share.
        return sources.map((source) => ({
            id: source.id,
            name: source.name,
            kind: source.id.startsWith("screen:") ? "screen" : "window",
            thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
            icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.resize({ width: 32, height: 32 }).toDataURL() : null,
        }));
    });

    handleFromApp("heorot:setPreferredDisplayMediaSource", (_event, sourceId: unknown) => {
        preferredDisplayMediaSourceId = typeof sourceId === "string" && sourceId.length > 0 ? sourceId : null;
    });

    handleFromApp("heorot:quitApp", () => {
        quitApp();
    });

    handleFromApp("heorot:getStartAtLogin", () => getStartAtLogin());

    handleFromApp("heorot:setStartAtLogin", (_event, enabled: unknown) => {
        setStartAtLogin(enabled === true);
        return getStartAtLogin();
    });

    handleFromApp("heorot:getUpdateStatus", () => (isAutoUpdateSupported() ? getUpdateStatus() : null));

    handleFromApp("heorot:checkForUpdates", () => (isAutoUpdateSupported() ? checkForUpdates() : null));

    handleFromApp("heorot:getAppVersion", () => app.getVersion());

    handleFromApp("heorot:installUpdate", () => {
        downloadAndInstallUpdate(() => {
            isAppQuitting = true;
        });
    });

    // Settings → Updates → "Install an earlier version" (the version is validated in updater.installVersion).
    handleFromApp("heorot:installVersion", (_event, version: unknown) =>
        installVersion(version, () => {
            isAppQuitting = true;
        }),
    );
}

async function bootstrap(): Promise<void> {
    app.on("before-quit", () => {
        isAppQuitting = true;
    });

    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
        app.quit();
        return;
    }

    app.on("second-instance", () => {
        focusMainWindow();
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            app.quit();
        }
    });

    app.on("activate", async () => {
        if (mainWindow) {
            focusMainWindow();
            return;
        }

        mainWindow = createMainWindow();
        await loadRenderer(mainWindow);
    });

    app.on("will-quit", () => {
        destroyTray();
    });

    await app.whenReady();
    if (process.platform === "win32") {
        // Windows shows notifications under this ID (the installer registers it); without it toasts can be dropped.
        app.setAppUserModelId("io.github.peytong.meadhall");
    }
    configureAppProtocol();
    configurePermissionHandlers(canNavigateInsideApp);
    configureMediaAuthInterceptor();
    configureDisplayMediaCapture();
    registerIpc();
    if (process.platform !== "darwin") {
        createTray(APP_TITLE, {
            showWindow: focusMainWindow,
            quit: quitApp,
            action: (action) => mainWindow?.webContents.send("heorot:trayAction", action),
        });
    }

    mainWindow = createMainWindow(wasLaunchedHidden());
    await loadRenderer(mainWindow);

    configureAutoUpdater(() => mainWindow);
}

void bootstrap();
