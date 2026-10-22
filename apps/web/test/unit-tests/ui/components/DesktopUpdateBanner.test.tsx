import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopUpdateBanner } from "../../../../src/ui/components/DesktopUpdateBanner";
import type { HeorotDesktopUpdateStatus } from "../../../../src/ui/types/heorotDesktop";

async function flushAsyncUpdates(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe("DesktopUpdateBanner", () => {
    let container: HTMLDivElement;
    let root: Root;
    let emitStatus: (status: HeorotDesktopUpdateStatus) => void;
    let installUpdate: ReturnType<typeof vi.fn>;
    let unsubscribe: ReturnType<typeof vi.fn>;

    function installBridge(initialStatus: HeorotDesktopUpdateStatus | null): void {
        installUpdate = vi.fn(async () => undefined);
        unsubscribe = vi.fn();
        window.heorotDesktop = {
            getUpdateStatus: vi.fn(async () => initialStatus),
            onUpdateStatus: vi.fn((listener: (status: HeorotDesktopUpdateStatus) => void) => {
                emitStatus = listener;
                return unsubscribe;
            }),
            installUpdate,
        };
    }

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
        await act(async () => {
            root.render(<DesktopUpdateBanner />);
        });
        await flushAsyncUpdates();

        expect(container.innerHTML).toBe("");
    });

    it("stays hidden until an update has been downloaded", async () => {
        installBridge({ state: "idle" });
        await act(async () => {
            root.render(<DesktopUpdateBanner />);
        });
        await flushAsyncUpdates();
        expect(container.querySelector(".desktop-update-banner")).toBeNull();

        await act(async () => {
            emitStatus({ state: "available", version: "0.2.0" });
        });
        expect(container.querySelector(".desktop-update-banner")).toBeNull();

        await act(async () => {
            emitStatus({ state: "downloaded", version: "0.2.0" });
        });
        expect(container.textContent).toContain("Heorot 0.2.0 is ready to install.");
    });

    it("installs on request and can be dismissed until the next version", async () => {
        installBridge({ state: "downloaded", version: "0.2.0" });
        await act(async () => {
            root.render(<DesktopUpdateBanner />);
        });
        await flushAsyncUpdates();

        const [installButton, laterButton] = Array.from(container.querySelectorAll("button"));
        await act(async () => {
            installButton.click();
        });
        expect(installUpdate).toHaveBeenCalledTimes(1);
        expect(installButton.disabled).toBe(true);

        await act(async () => {
            laterButton.click();
        });
        expect(container.querySelector(".desktop-update-banner")).toBeNull();

        await act(async () => {
            emitStatus({ state: "downloaded", version: "0.3.0" });
        });
        expect(container.textContent).toContain("Heorot 0.3.0 is ready to install.");
    });

    it("unsubscribes from update events on unmount", async () => {
        installBridge(null);
        await act(async () => {
            root.render(<DesktopUpdateBanner />);
        });
        await act(async () => {
            root.unmount();
        });
        root = createRoot(container);

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
