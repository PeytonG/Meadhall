// SPDX-License-Identifier: AGPL-3.0-only
// The real desktop app: signs in to the test Synapse and checks what only Electron shows, like the window-controls
// strip (minimize/maximize/close) matching the theme. Build first: pnpm --dir apps/desktop run build
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { canLogIn, createRoom, joinRoom, makeServerAdmin, readPresence, readProfileField, registerUser, sendMessage, setAccountData, setDisplayName, setProfileField, type ApiUser } from "../e2e/support/matrixApi";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "desktop");
const electronBinary = createRequire(path.join(desktopDir, "package.json"))("electron") as unknown as string;

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
    // A fake Steam install running Stardew Valley, for "Playing ...".
    const steamDir = fs.mkdtempSync(path.join(os.tmpdir(), "meadhall-steam-"));
    fs.mkdirSync(path.join(steamDir, "steamapps"));
    fs.writeFileSync(path.join(steamDir, "registry.vdf"), '"Registry" { "HKCU" { "Software" { "Valve" { "Steam" { "RunningAppID" "413150" } } } } }');
    fs.writeFileSync(path.join(steamDir, "steamapps", "libraryfolders.vdf"), '"libraryfolders" { }');
    fs.writeFileSync(path.join(steamDir, "steamapps", "appmanifest_413150.acf"), '"AppState" { "appid" "413150" "name" "Stardew Valley" }');
    const env = {
        ...process.env,
        MEADHALL_USER_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "meadhall-desktop-test-")),
        MEADHALL_STEAM_DIR: steamDir,
        // A one-game list for Rich Presence (the real one is arRPC's ~4 MB list).
        MEADHALL_DETECTABLE_DB: (() => {
            const file = path.join(steamDir, "detectable.json");
            fs.writeFileSync(file, JSON.stringify([{ id: "1234567890123", name: "Pixel Quest", executables: [{ name: "pixelquest.exe", os: "win32" }] }]));
            return file;
        })(),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: electronBinary, args: [desktopDir], env });
    window = await app.firstWindow();
});

test.afterAll(async () => {
    await app?.close();
});

// The window as the OS draws it, title bar included, sampled at a point (x from the right edge).
async function windowPixel(fromRight: number, y: number): Promise<[number, number, number]> {
    return app.evaluate(
        async ({ BrowserWindow, desktopCapturer }, { fromRight, y }) => {
            const win = BrowserWindow.getAllWindows()[0];
            const bounds = win.getContentBounds();
            const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: bounds.width, height: bounds.height } });
            const source = sources.find((candidate) => candidate.id === win.getMediaSourceId()) ?? sources.find((candidate) => candidate.name === win.getTitle());
            if (!source) throw new Error("window not captured");
            const image = source.thumbnail;
            const size = image.getSize();
            const bitmap = image.toBitmap(); // BGRA
            const x = size.width - Math.round(fromRight * (size.width / bounds.width));
            const row = Math.round(y * (size.height / bounds.height));
            const offset = (row * size.width + x) * 4;
            return [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset]] as [number, number, number];
        },
        { fromRight, y },
    );
}

function distance(a: [number, number, number], b: [number, number, number]): number {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

let carolDm = "";
let deskUser: ApiUser;
let carolUser: ApiUser;
let bob: ApiUser;

// One signed-in app for all the checks: the user has two DMs (Carol's opens first, Bob's stays in the background).
test.beforeAll(async () => {
    const user = await registerUser("desk");
    deskUser = user;
    bob = await registerUser("bob");
    const carol = await registerUser("carol");
    carolUser = carol;
    await setDisplayName(bob, "Bob");
    const bobDm = await createRoom(bob, { is_direct: true, preset: "trusted_private_chat", invite: [user.userId] });
    carolDm = await createRoom(carol, { is_direct: true, preset: "trusted_private_chat", invite: [user.userId] });
    for (const roomId of [bobDm, carolDm]) await joinRoom(user, roomId);
    await setAccountData(user, "m.direct", { [bob.userId]: [bobDm], [carol.userId]: [carolDm] });
    await sendMessage(carol, carolDm, "hi from carol");
    (globalThis as unknown as { bobDm: string }).bobDm = bobDm;

    await window.getByRole("textbox", { name: "Homeserver" }).first().fill("http://localhost:8008");
    await window.getByLabel("Username or email").fill(user.username);
    await window.getByLabel("Password", { exact: true }).fill(user.password);
    await window.locator("form").getByRole("button", { name: "Sign in" }).click();
    const skip = window.getByRole("button", { name: "Skip for now" });
    const home = window.getByTestId("rail-home");
    await expect(home.or(skip).first()).toBeVisible({ timeout: 60_000 });
    if (await skip.isVisible()) await skip.click();
    await expect(home).toBeVisible({ timeout: 60_000 });
});

test("the window controls match the app in dark and light themes", async () => {
    test.skip(process.platform !== "win32", "the window-controls overlay is drawn by Windows");
    for (const theme of ["dark", "light"] as const) {
        await window.evaluate((theme) => {
            document.documentElement.setAttribute("data-theme", theme);
            window.dispatchEvent(new Event("resize"));
        }, theme);
        await window.waitForTimeout(1200);
        // The overlay (138 px of buttons on the right) vs. the app just left of it, both in the title-bar band.
        const overlay = await windowPixel(100, 4); // inside the minimize button, above its icon
        const app = await windowPixel(200, 4);
        console.log(theme, "overlay", overlay, "app", app);
        expect(distance(overlay, app), `${theme}: overlay ${overlay} vs app ${app}`).toBeLessThanOrEqual(4); // the old fixed color (#121a23) was 9 off the dark theme
    }
});

test("messages raise native OS notifications (on by default), and clicking one opens the conversation", async () => {
    // Record notifications in the main process instead of showing them.
    await app.evaluate(({ Notification }) => {
        const shown: Array<{ title: string; body: string }> = [];
        (globalThis as unknown as { shownNotifications: typeof shown }).shownNotifications = shown;
        (globalThis as unknown as { lastNotification: unknown }).lastNotification = null;
        Notification.prototype.show = function show(this: InstanceType<typeof Notification>) {
            shown.push({ title: this.title, body: this.body });
            (globalThis as unknown as { lastNotification: unknown }).lastNotification = this;
        };
    });
    await window.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: /carol/i }).click();
    await expect(window.locator(".timeline").getByText("hi from carol")).toBeVisible();

    await sendMessage(bob, (globalThis as unknown as { bobDm: string }).bobDm, "Fireside at sundown?");
    await expect
        .poll(() => app.evaluate(() => (globalThis as unknown as { shownNotifications: Array<{ title: string; body: string }> }).shownNotifications), { timeout: 20_000 })
        .toContainEqual(expect.objectContaining({ body: "Fireside at sundown?" }));

    await app.evaluate(() => (globalThis as unknown as { lastNotification: { emit: (name: string) => void } }).lastNotification.emit("click"));
    await expect(window.locator(".timeline").getByText("Fireside at sundown?")).toBeVisible();
    await expect(window.locator(".channel-header-title")).toContainText(/bob/i);
});

test("automatic Away can read how long the whole computer has been idle", async () => {
    const idleSeconds = await window.evaluate(() => window.heorotDesktop?.getSystemIdleSeconds?.());
    expect(typeof idleSeconds).toBe("number");
    expect(idleSeconds).toBeGreaterThanOrEqual(0);
});

test("the tray menu mutes, deafens and sets your status, and follows changes made in the app", async () => {
    test.skip(process.platform === "darwin", "macOS has no tray icon");
    type MenuItem = { label: string; checked: boolean; click: () => void; submenu?: { items: MenuItem[] } };
    const trayItems = (): Promise<Array<{ label: string; checked: boolean; submenu?: Array<{ label: string; checked: boolean }> }>> =>
        app.evaluate(() =>
            ((globalThis as unknown as { meadhallTrayMenu: { items: MenuItem[] } }).meadhallTrayMenu.items).map((item) => ({
                label: item.label,
                checked: item.checked,
                submenu: item.submenu?.items.map((sub) => ({ label: sub.label, checked: sub.checked })),
            })),
        );
    const clickTray = (label: string, sublabel?: string): Promise<void> =>
        app.evaluate(
            (_electron, { label, sublabel }) => {
                const items = (globalThis as unknown as { meadhallTrayMenu: { items: MenuItem[] } }).meadhallTrayMenu.items;
                const item = items.find((candidate) => candidate.label === label);
                const target = sublabel ? item?.submenu?.items.find((candidate) => candidate.label === sublabel) : item;
                if (!target) throw new Error(`no tray item ${label} ${sublabel ?? ""}`);
                target.click();
            },
            { label, sublabel },
        );

    // Menu → app.
    await clickTray("Mute");
    await expect(window.getByTestId("self-mute")).toHaveAttribute("aria-pressed", "true");
    await clickTray("Status", "Do Not Disturb");
    await expect(window.locator(".pane-user-card .avatar-presence-dot")).toHaveClass(/is-dnd/);
    await expect.poll(trayItems).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ label: "Mute", checked: true }),
            expect.objectContaining({ label: "Status", submenu: expect.arrayContaining([{ label: "Do Not Disturb", checked: true }]) }),
        ]),
    );

    // App → menu.
    await window.getByTestId("self-mute").click();
    await window.getByTestId("self-deafen").click();
    await expect.poll(trayItems).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: "Deafen", checked: true })]),
    );
    await window.getByTestId("self-deafen").click();
    await clickTray("Status", "Automatic");
    await expect(window.locator(".pane-user-card .avatar-presence-dot")).not.toHaveClass(/is-dnd/);
});

test("the game Steam is running is shared as Playing ..., and Privacy can turn it off", async () => {
    expect(await window.evaluate(() => window.heorotDesktop?.getActivity?.())).toEqual({ name: "Stardew Valley", appId: "413150", source: "steam" });
    // Under your own name in the user panel.
    await expect(window.getByTestId("own-status-text")).toHaveText("Playing Stardew Valley", { timeout: 40_000 });
    // By default only people you share a chat or server with see it: in your presence (live over sync, and what
    // Element shows), not in your profile, which anyone can read.
    await expect
        .poll(() => readPresence(bob, deskUser.userId).then((presence) => presence.status_msg ?? ""), { timeout: 20_000 })
        .toBe("Playing Stardew Valley");
    await expect
        .poll(() => readProfileField(bob, deskUser.userId, "io.github.peytong.meadhall.status").catch(() => null), { timeout: 20_000 })
        .toMatchObject({ activity: null });

    // "Everyone" also puts it in the profile.
    await window.getByRole("button", { name: "User settings", exact: true }).click();
    await window.getByRole("button", { name: "Privacy & Safety", exact: true }).click();
    await window.getByTestId("activity-audience").selectOption("everyone");
    await expect
        .poll(() => readProfileField(bob, deskUser.userId, "io.github.peytong.meadhall.status").catch(() => null), { timeout: 20_000 })
        .toMatchObject({ activity: { name: "Stardew Valley", kind: "playing" } });
    // "Nobody": gone from both, but Settings still shows you what it found.
    await window.getByTestId("activity-audience").selectOption("nobody");
    await expect(window.getByTestId("activity-preview")).toHaveText("Only you see: Playing Stardew Valley");
    await expect
        .poll(() => readPresence(bob, deskUser.userId).then((presence) => presence.status_msg ?? ""), { timeout: 20_000 })
        .toBe("");
    await expect
        .poll(() => readProfileField(bob, deskUser.userId, "io.github.peytong.meadhall.status").catch(() => null), { timeout: 20_000 })
        .toMatchObject({ activity: null });
    await window.getByTestId("activity-audience").selectOption("contacts");
    await expect
        .poll(() => readPresence(bob, deskUser.userId).then((presence) => presence.status_msg ?? ""), { timeout: 20_000 })
        .toBe("Playing Stardew Valley");

    await window.getByTestId("share-activity").uncheck();
    await window.keyboard.press("Escape");
    await expect
        .poll(() => readProfileField(bob, deskUser.userId, "io.github.peytong.meadhall.status").catch(() => null), { timeout: 20_000 })
        .toMatchObject({ activity: null });
    await expect(window.getByTestId("own-status-text")).not.toContainText("Playing");
    await expect
        .poll(() => readPresence(bob, deskUser.userId).then((presence) => presence.status_msg ?? ""), { timeout: 20_000 })
        .toBe("");
});

test("after an update, What's new shows that release's notes once", async () => {
    // This build runs as 0.1.0 (CHANGELOG has a v0.1.0 section); pretend the install last ran 0.0.9.
    await window.evaluate(() => localStorage.setItem("meadhall.whats_new_seen_version", "0.0.9"));
    await window.reload();
    const dialog = window.getByTestId("whats-new");
    const skip = window.getByRole("button", { name: "Skip for now" });
    await expect(dialog.or(skip).first()).toBeVisible({ timeout: 60_000 });
    if (await skip.isVisible()) await skip.click();
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toContainText("What's new in Meadhall 0.1.0");
    await dialog.getByRole("button", { name: "Got it" }).click();
    await expect(dialog).toBeHidden();
    expect(await window.evaluate(() => localStorage.getItem("meadhall.whats_new_seen_version"))).toBe("0.1.0");

    await window.reload();
    await expect(window.getByTestId("rail-home").or(window.getByRole("button", { name: "Skip for now" })).first()).toBeVisible({ timeout: 60_000 });
    await window.waitForTimeout(1500);
    await expect(window.getByTestId("whats-new")).toHaveCount(0);
});

// Reported broken in the desktop app: it asked for the new password with window.prompt, which Electron lacks.
test("server admins can reset someone's password in the desktop app", async () => {
    await makeServerAdmin(deskUser);
    await window.reload();
    const skip = window.getByRole("button", { name: "Skip for now" });
    await expect(window.getByTestId("rail-home").or(skip).first()).toBeVisible({ timeout: 60_000 });
    if (await skip.isVisible()) await skip.click();
    await window.getByRole("button", { name: "User settings", exact: true }).click();
    await window.getByRole("button", { name: "Server admin", exact: true }).click();
    await window.getByLabel("Search users").fill(bob.username);
    const row = window.locator(`[data-user-id="${bob.userId}"]`);
    await row.getByRole("button", { name: "Reset password" }).click();
    await row.getByLabel(/New password/).fill("desktop-reset-789");
    await row.getByRole("button", { name: "Set password", exact: true }).click();
    await expect(window.getByTestId("admin-revealed-password")).toHaveText("desktop-reset-789");
    expect(await canLogIn(bob.username, "desktop-reset-789")).toBe(true);
    await window.keyboard.press("Escape");
});

test("the taskbar icon shows a red unread bubble in the top-right, and clears when read", async () => {
    type Badge = { count: number; icon: string | null } | undefined;
    const badge = (): Promise<Badge> => app.evaluate(() => (globalThis as unknown as { meadhallUnreadBadge?: Badge }).meadhallUnreadBadge);
    // Reading Bob's DM; Carol writes twice.
    await window.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: /bob/i }).click();
    await sendMessage(carolUser, carolDm, "are you there?");
    await sendMessage(carolUser, carolDm, "hello??");
    await expect.poll(async () => (await badge())?.count ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);

    // The icon the window now uses: Meadhall's with a red bubble top-right, the bottom-left untouched.
    const pixels = await app.evaluate(({ nativeImage }) => {
        const icon = (globalThis as unknown as { meadhallUnreadBadge: { icon: string } }).meadhallUnreadBadge.icon;
        const image = nativeImage.createFromDataURL(icon);
        const { width } = image.getSize();
        const bitmap = image.toBitmap(); // BGRA
        const at = (x: number, y: number) => {
            const offset = (y * width + x) * 4;
            return [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset]];
        };
        // Inside the bubble (centre 49,15; radius 15+) but left of the number.
        return { size: width, topRight: at(37, 15), bottomLeft: at(8, width - 8) };
    });
    expect(pixels.size).toBe(64);
    const [r, g, b] = pixels.topRight;
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(100);
    expect(b).toBeLessThan(100);
    expect(pixels.bottomLeft).not.toEqual(pixels.topRight);

    // Reading Carol's messages clears it.
    await window.getByRole("region", { name: "Direct messages" }).getByTestId("home-row").filter({ hasText: /carol/i }).click();
    await expect(window.locator(".timeline").getByText("hello??")).toBeVisible();
    await expect.poll(async () => (await badge())?.count ?? -1, { timeout: 30_000 }).toBe(0);
});

test("installing another version only accepts real version numbers", async () => {
    const attempt = (version: unknown) => window.evaluate((value) => window.heorotDesktop?.installVersion?.(value as string), version);
    for (const bad of ["../../evil", "0.3.1; rm -rf /", "v0.3.1", "", 42]) {
        expect(await attempt(bad)).toEqual({ ok: false, message: "That isn't a Meadhall version." });
    }
    // A real version is accepted; this unpackaged test build just can't install it.
    expect(await attempt("0.3.1")).toEqual({ ok: false, message: "Installing other versions works in the installed app only." });
});

test("desktop functions only answer Meadhall's own page", async () => {
    // A page from somewhere else, given the app's own preload, must not be able to use them.
    const preload = path.join(desktopDir, "dist", "electron", "preload.js");
    const foreign = await app.evaluate(async ({ BrowserWindow }, preloadPath) => {
        const other = new BrowserWindow({ show: false, webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true } });
        await other.loadURL("data:text/html,<title>foreign</title>");
        const result = await other.webContents.executeJavaScript(
            "window.heorotDesktop ? window.heorotDesktop.getAppVersion().then(() => 'answered', (error) => 'refused: ' + error.message) : 'no bridge'",
        );
        other.destroy();
        return result as string;
    }, preload);
    expect(foreign).toMatch(/^refused: .*not allowed from data:/);
    // The app itself still works.
    expect(await window.evaluate(() => window.heorotDesktop?.getAppVersion?.())).toMatch(/^\d+\.\d+\.\d+/);
});

test("the screen share picker gets its list at once and real previews right after", async () => {
    const result = await window.evaluate(async () => {
        const bridge = (globalThis as unknown as { heorotDesktop: { getDesktopCapturerSources: (options?: { previews?: boolean }) => Promise<Array<{ id: string; kind?: string; thumbnail?: string | null }>> } }).heorotDesktop;
        const started = performance.now();
        const quick = await bridge.getDesktopCapturerSources({ previews: false });
        const quickMs = performance.now() - started;
        const full = await bridge.getDesktopCapturerSources({ previews: true });
        // How much of each screen's preview is near-black (a preview that failed is all black or missing).
        const darkShare = async (dataUrl: string): Promise<number> => {
            const image = new Image();
            image.src = dataUrl;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let dark = 0;
            for (let index = 0; index < pixels.length; index += 4) if (pixels[index] + pixels[index + 1] + pixels[index + 2] < 15) dark += 1;
            return dark / (pixels.length / 4);
        };
        const screens = full.filter((source) => source.kind === "screen");
        return {
            quickMs,
            quickCount: quick.length,
            quickThumbnails: quick.filter((source) => source.thumbnail).length,
            screens: screens.length,
            screenDark: await Promise.all(screens.map((source) => (source.thumbnail ? darkShare(source.thumbnail) : Promise.resolve(1)))),
        };
    });
    expect(result.quickCount).toBeGreaterThan(0);
    expect(result.quickThumbnails).toBe(0);
    expect(result.quickMs).toBeLessThan(1500);
    expect(result.screens).toBeGreaterThan(0);
    // The desktop isn't black: at least one screen's preview shows something.
    expect(Math.min(...result.screenDark)).toBeLessThan(0.9);
});

test("Open in the background at sign-in stays on when turned on (and off when turned off)", async () => {
    const read = (): Promise<boolean> => window.evaluate(() => (globalThis as unknown as { heorotDesktop: { getStartAtLogin: () => Promise<boolean> } }).heorotDesktop.getStartAtLogin());
    const set = (enabled: boolean): Promise<boolean> =>
        window.evaluate((value) => (globalThis as unknown as { heorotDesktop: { setStartAtLogin: (on: boolean) => Promise<boolean> } }).heorotDesktop.setStartAtLogin(value), enabled);
    const before = await read();
    try {
        expect(await set(true)).toBe(true);
        expect(await read()).toBe(true);
        expect(await set(false)).toBe(false);
        expect(await read()).toBe(false);
    } finally {
        // Leave this computer's login items as they were.
        await set(before);
    }
});

test("the app identifies itself as Meadhall (not the package name)", async () => {
    const userAgent = await window.evaluate(() => navigator.userAgent);
    expect(userAgent).toMatch(/ Meadhall\/\d+\.\d+\.\d+/);
    expect(userAgent).not.toContain("heorot");
});

test("the window controls take the color of a profile card's gradient under them", async () => {
    test.skip(process.platform !== "win32", "the window-controls overlay is drawn by Windows");
    await setProfileField(bob, "io.github.peytong.meadhall.profile_style", { card: { preset: "ember" } });
    const bobDm = (globalThis as unknown as { bobDm: string }).bobDm;
    await sendMessage(bob, bobDm, "check out my card");
    await window.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "dark");
        window.dispatchEvent(new Event("resize"));
    });
    await window.getByTestId("home-row").filter({ hasText: "Bob" }).click();
    await window.locator(".timeline .timeline-sender").filter({ hasText: "Bob" }).first().click();
    await expect(window.getByTestId("profile-card")).toHaveClass(/has-card-style/, { timeout: 20_000 });
    await window.waitForTimeout(1200);
    // Ember starts at #ff7a18: the minimize button's background should be that color.
    const overlay = await windowPixel(100, 4);
    expect(distance(overlay, [0xff, 0x7a, 0x18]), `overlay ${overlay}`).toBeLessThanOrEqual(6);
    await window.keyboard.press("Escape");
});

// A game talking to the Rich Presence server the way it would talk to Discord (the discord-ipc pipe/socket).
function frame(type: number, data: unknown): Buffer {
    const json = Buffer.from(JSON.stringify(data));
    const header = Buffer.alloc(8);
    header.writeInt32LE(type, 0);
    header.writeInt32LE(json.length, 4);
    return Buffer.concat([header, json]);
}

async function connectAsGame(clientId: string): Promise<net.Socket> {
    for (let index = 0; index < 10; index += 1) {
        const socketPath = process.platform === "win32" ? `\\\\?\\pipe\\discord-ipc-${index}` : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || "/tmp", `discord-ipc-${index}`);
        const socket = await new Promise<net.Socket | null>((resolve) => {
            const candidate = net.createConnection(socketPath);
            let data = Buffer.alloc(0);
            const timer = setTimeout(() => {
                candidate.destroy();
                resolve(null);
            }, 2000);
            candidate.on("error", () => {
                clearTimeout(timer);
                resolve(null);
            });
            candidate.on("connect", () => candidate.write(frame(0, { v: 1, client_id: clientId })));
            candidate.on("data", (chunk) => {
                data = Buffer.concat([data, chunk]);
                // Meadhall's server, not a real Discord that happens to be running.
                if (data.includes("READY") && data.includes('"meadhall"')) {
                    clearTimeout(timer);
                    candidate.removeAllListeners("data");
                    resolve(candidate);
                }
            });
        });
        if (socket) return socket;
    }
    throw new Error("Meadhall's Rich Presence server isn't listening");
}

// A WebSocket handshake with a chosen Origin: true if Meadhall's server answered READY (accepted it).
function websocketHandshake(port: number, origin: string | null): Promise<boolean> {
    return new Promise((resolve) => {
        const request = http.request({
            host: "127.0.0.1",
            port,
            path: "/?v=1&encoding=json&client_id=1234567890123",
            headers: {
                Connection: "Upgrade",
                Upgrade: "websocket",
                "Sec-WebSocket-Version": "13",
                "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
                ...(origin ? { Origin: origin } : {}),
            },
        });
        request.on("error", () => resolve(false));
        request.on("response", () => resolve(false));
        request.on("upgrade", (_response, socket) => {
            let data = "";
            socket.on("data", (chunk: Buffer) => {
                data += chunk.toString("latin1");
            });
            setTimeout(() => {
                socket.destroy();
                resolve(data.includes('"meadhall"'));
            }, 1000);
        });
        request.end();
    });
}

// Meadhall's port in Discord's range (a running Discord may hold the first one).
async function richPresencePort(): Promise<number | null> {
    for (let port = 6463; port <= 6472; port += 1) if (await websocketHandshake(port, null)) return port;
    return null;
}

test("Rich Presence: a game's activity is shared (named from the local list), can be hidden, and web pages can't use it", async () => {
    await window.getByRole("button", { name: "User settings", exact: true }).click();
    await window.getByRole("button", { name: "Privacy & Safety", exact: true }).click();
    await window.getByTestId("share-activity").check();
    await window.getByTestId("activity-rich-presence").check();

    const game = await connectAsGame("1234567890123");
    game.write(
        frame(1, {
            cmd: "SET_ACTIVITY",
            nonce: "1",
            args: { pid: 4242, activity: { details: "In a match", state: "3 of 5", timestamps: { start: Math.floor(Date.now() / 1000) } } },
        }),
    );
    // Named from the game list (the game only sends its id), before Steam's game; details only when allowed.
    await expect(window.getByTestId("activity-now")).toContainText("Pixel Quest", { timeout: 30_000 });
    await expect
        .poll(() => readPresence(bob, deskUser.userId).then((presence) => presence.status_msg ?? ""), { timeout: 40_000 })
        .toBe("Playing Pixel Quest");
    await window.getByTestId("activity-details").check();
    await expect
        .poll(() => readPresence(bob, deskUser.userId).then((presence) => presence.status_msg ?? ""), { timeout: 40_000 })
        .toBe("Playing Pixel Quest · In a match · 3 of 5");
    if (process.env.PREVIEW_DIR) await window.getByTestId("activity-settings").screenshot({ path: `${process.env.PREVIEW_DIR}/activity-settings.png` });

    // "Never share this": the next thing (Steam's game) is shared instead.
    await window.getByTestId("activity-now").locator(".activity-now-row").filter({ hasText: "Pixel Quest" }).getByTestId("activity-hide").click();
    await expect
        .poll(() => readPresence(bob, deskUser.userId).then((presence) => presence.status_msg ?? ""), { timeout: 40_000 })
        .toBe("Playing Stardew Valley");

    // Local apps (no Origin) may connect; a web page (any other Origin) may not.
    const port = await richPresencePort();
    expect(port).not.toBeNull();
    expect(await websocketHandshake(port!, "https://evil.example")).toBe(false);
    expect(await websocketHandshake(port!, null)).toBe(true);

    // Turning Rich Presence off closes the server.
    game.destroy();
    await window.getByTestId("activity-rich-presence").uncheck();
    await expect.poll(() => richPresencePort(), { timeout: 15_000 }).toBeNull();
    await window.getByTestId("activity-details").uncheck();
    await window.keyboard.press("Escape");
});
