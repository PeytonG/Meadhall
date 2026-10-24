// SPDX-License-Identifier: AGPL-3.0-only
// Device verification started from this device: emoji comparison can only begin once the other device has accepted
// (before that the SDK fails with "startVerification(): other device is unknown", which the owner hit).
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerificationDialog } from "../../../../src/ui/components/verification/VerificationDialog";

function fakeRequest() {
    const listeners = new Set<() => void>();
    const request = {
        initiatedByMe: true,
        otherUserId: "@me:example.org",
        phase: 2, // Requested
        cancellationCode: null,
        accept: vi.fn(async () => undefined),
        cancel: vi.fn(async () => undefined),
        startVerification: vi.fn(async () => ({ on: () => undefined, off: () => undefined, verify: async () => undefined, getShowSasCallbacks: () => null, getReciprocateQrCodeCallbacks: () => null })),
        scanQRCode: vi.fn(),
        generateQRCode: vi.fn(async () => undefined),
        on: (_event: string, listener: () => void) => listeners.add(listener),
        off: (_event: string, listener: () => void) => listeners.delete(listener),
        change(phase: number) {
            request.phase = phase;
            listeners.forEach((listener) => listener());
        },
    };
    return request;
}

describe("verification dialog", () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
    });

    async function open(request: ReturnType<typeof fakeRequest>, getUserDeviceInfo = vi.fn(async () => new Map())) {
        const client = {
            getUserId: () => "@me:example.org",
            getSafeUserId: () => "@me:example.org",
            getCrypto: () => ({ requestOwnUserVerification: async () => request, requestDeviceVerification: async () => request, getUserDeviceInfo }),
            on: () => undefined,
            off: () => undefined,
            removeListener: () => undefined,
        };
        await act(async () => {
            root.render(React.createElement(VerificationDialog, { client: client as never, open: true, onClose: () => undefined }));
        });
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        return getUserDeviceInfo;
    }

    const sasButton = () => container.querySelector<HTMLButtonElement>("[data-testid=start-sas]");

    it("waits for the other device to accept before emoji verification can start", async () => {
        const request = fakeRequest();
        const getUserDeviceInfo = await open(request);
        expect(sasButton()?.disabled).toBe(true);
        expect(sasButton()?.textContent).toContain("Waiting for your other device");

        await act(async () => request.change(3)); // Ready: the other device accepted
        expect(sasButton()?.disabled).toBe(false);
        await act(async () => {
            sasButton()?.click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        // The device list is refreshed first, then emoji verification starts.
        expect(getUserDeviceInfo).toHaveBeenCalledWith(["@me:example.org"], true);
        expect(request.startVerification).toHaveBeenCalledWith("m.sas.v1");
    });

    it("explains the SDK's \"other device is unknown\" in plain words", async () => {
        const request = fakeRequest();
        request.startVerification.mockRejectedValueOnce(new Error("startVerification(): other device is unknown"));
        await open(request);
        await act(async () => request.change(3));
        await act(async () => {
            sasButton()?.click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(container.textContent).toContain("Your other device hasn't answered yet");
        expect(container.textContent).not.toContain("startVerification()");
    });
});
