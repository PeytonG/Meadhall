// SPDX-License-Identifier: AGPL-3.0-only
// The notice shown anywhere in the app when a call ended without you choosing to.
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CallEndedNotice } from "../../../../src/ui/components/voice/CallEndedNotice";
import { announceCallEnded } from "../../../../src/ui/voice/callLog";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const notice = (): HTMLElement | null => host.querySelector('[data-testid="call-ended-notice"]');
const button = (label: string): HTMLButtonElement =>
    [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === label) as HTMLButtonElement;

describe("CallEndedNotice", () => {
    it("shows why a call ended until dismissed", () => {
        act(() => root.render(<CallEndedNotice onViewDetails={() => undefined} />));
        expect(notice()).toBeNull();
        act(() => announceCallEnded("Nobody else was in it for 5 minutes."));
        expect(notice()?.textContent).toContain("Nobody else was in it for 5 minutes.");
        act(() => button("Dismiss").click());
        expect(notice()).toBeNull();
    });

    it("View details opens the logs and closes the notice", () => {
        const onViewDetails = vi.fn();
        act(() => root.render(<CallEndedNotice onViewDetails={onViewDetails} />));
        act(() => announceCallEnded("The call dropped (network) and Meadhall couldn't get back in."));
        act(() => button("View details").click());
        expect(onViewDetails).toHaveBeenCalledOnce();
        expect(notice()).toBeNull();
    });
});
