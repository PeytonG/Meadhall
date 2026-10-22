// SPDX-License-Identifier: AGPL-3.0-only
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopUpdateBanner } from "../../../../src/ui/components/DesktopUpdateBanner";
import { UpdatesTab } from "../../../../src/ui/settings/user/tabs/UpdatesTab";
import type { HeorotDesktopUpdateStatus } from "../../../../src/ui/types/heorotDesktop";

async function flushAsyncUpdates(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe("desktop updates", () => {
    let container: HTMLDivElement;
    let root: Root;
    let emitStatus: (status: HeorotDesktopUpdateStatus) => void;
    let installUpdate: ReturnType<typeof vi.fn>;
    let checkForUpdates: ReturnType<typeof vi.fn>;
    let unsubscribe: ReturnType<typeof vi.fn>;

    function installBridge(initialStatus: HeorotDesktopUpdateStatus | null): void {
        installUpdate = vi.fn(async () => undefined);
        checkForUpdates = vi.fn(async () => ({ state: "up-to-date", currentVersion: "0.2.0" }) as const);
        unsubscribe = vi.fn();
        window.heorotDesktop = {
            getUpdateStatus: vi.fn(async () => initialStatus),
            onUpdateStatus: vi.fn((listener: (status: HeorotDesktopUpdateStatus) => void) => {
                emitStatus = listener;
                return unsubscribe;
            }),
            installUpdate,
            checkForUpdates,
            getAppVersion: vi.fn(async () => "0.2.0"),
        };
    }

    async function render(element: React.ReactElement): Promise<void> {
        await act(async () => {
            root.render(element);
        });
        await flushAsyncUpdates();
    }

    const button = (label: string): HTMLButtonElement | undefined =>
        Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === label);

    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        delete window.heorotDesktop;
    });

    it("renders nothing outside the desktop app", async () => {
        await render(<DesktopUpdateBanner />);
        expect(container.innerHTML).toBe("");
    });

    it("announces an available update and installs it on 'Update now'", async () => {
        installBridge({ state: "idle" });
        await render(<DesktopUpdateBanner />);
        expect(container.querySelector(".desktop-update-banner")).toBeNull();

        await act(async () => emitStatus({ state: "available", version: "0.3.0" }));
        expect(container.textContent).toContain("Meadhall 0.3.0 is available.");

        await act(async () => button("Update now")!.click());
        expect(installUpdate).toHaveBeenCalledTimes(1);

        await act(async () => emitStatus({ state: "downloading", version: "0.3.0", percent: 42 }));
        expect(container.textContent).toContain("Downloading Meadhall 0.3.0… 42%");

        await act(async () => emitStatus({ state: "downloaded", version: "0.3.0" }));
        expect(container.textContent).toContain("Installing Meadhall 0.3.0 and restarting…");
    });

    it("can be dismissed until the next version", async () => {
        installBridge({ state: "available", version: "0.3.0" });
        await render(<DesktopUpdateBanner />);

        await act(async () => button("Later")!.click());
        expect(container.querySelector(".desktop-update-banner")).toBeNull();

        await act(async () => emitStatus({ state: "available", version: "0.4.0" }));
        expect(container.textContent).toContain("Meadhall 0.4.0 is available.");
    });

    it("stays quiet about background errors but reports a failed update the user started", async () => {
        installBridge({ state: "error", message: "offline" });
        await render(<DesktopUpdateBanner />);
        expect(container.querySelector(".desktop-update-banner")).toBeNull();

        await act(async () => emitStatus({ state: "available", version: "0.3.0" }));
        await act(async () => button("Update now")!.click());
        await act(async () => emitStatus({ state: "error", message: "download interrupted" }));
        expect(container.textContent).toContain("The update failed: download interrupted");
        await act(async () => button("Try again")!.click());
        expect(installUpdate).toHaveBeenCalledTimes(2);
    });

    it("unsubscribes from update events on unmount", async () => {
        installBridge(null);
        await render(<DesktopUpdateBanner />);
        await act(async () => root.unmount());
        root = createRoot(container);
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("shows the version and checks for updates from settings", async () => {
        installBridge({ state: "idle" });
        await render(<UpdatesTab />);
        expect(container.textContent).toContain("Meadhall 0.2.0");

        await act(async () => button("Check for updates")!.click());
        await flushAsyncUpdates();
        expect(checkForUpdates).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain("You're on the latest version.");

        await act(async () => emitStatus({ state: "available", version: "0.3.0" }));
        await act(async () => button("Update to 0.3.0")!.click());
        expect(installUpdate).toHaveBeenCalledTimes(1);
    });
});
