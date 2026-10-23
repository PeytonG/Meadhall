// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALONE_TIMEOUT_MS, createAloneWatcher } from "../../../../src/ui/voice/aloneInCall";

describe("createAloneWatcher", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("leaves after five minutes alone", () => {
        const onTimeout = vi.fn();
        const watcher = createAloneWatcher(onTimeout);
        watcher.update(true, 0);
        vi.advanceTimersByTime(ALONE_TIMEOUT_MS - 1);
        expect(onTimeout).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it("restarts the countdown when someone joins and leaves again", () => {
        const onTimeout = vi.fn();
        const watcher = createAloneWatcher(onTimeout);
        watcher.update(true, 0);
        vi.advanceTimersByTime(ALONE_TIMEOUT_MS - 1_000);
        watcher.update(true, 1);
        watcher.update(true, 0);
        vi.advanceTimersByTime(ALONE_TIMEOUT_MS - 1_000);
        expect(onTimeout).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1_000);
        expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it("does not restart the countdown on repeated updates while alone", () => {
        const onTimeout = vi.fn();
        const watcher = createAloneWatcher(onTimeout);
        watcher.update(true, 0);
        vi.advanceTimersByTime(ALONE_TIMEOUT_MS / 2);
        watcher.update(true, 0);
        vi.advanceTimersByTime(ALONE_TIMEOUT_MS / 2);
        expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it("never fires when not connected, or after dispose", () => {
        const onTimeout = vi.fn();
        const watcher = createAloneWatcher(onTimeout);
        watcher.update(false, 0);
        vi.advanceTimersByTime(ALONE_TIMEOUT_MS * 2);
        watcher.update(true, 0);
        watcher.dispose();
        vi.advanceTimersByTime(ALONE_TIMEOUT_MS * 2);
        expect(onTimeout).not.toHaveBeenCalled();
    });
});
