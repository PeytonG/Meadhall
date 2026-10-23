// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AWAY_AFTER_MS, startAwayTracker } from "../../../../src/ui/presence/autoAway";

describe("startAwayTracker", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("goes away after 10 minutes without input and comes back on input", async () => {
        const target = new EventTarget() as unknown as Window;
        const onChange = vi.fn();
        const stop = startAwayTracker(onChange, { target });
        await vi.advanceTimersByTimeAsync(AWAY_AFTER_MS - 30_000);
        expect(onChange).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(30_000);
        expect(onChange).toHaveBeenLastCalledWith(true);

        target.dispatchEvent(new Event("pointermove"));
        expect(onChange).toHaveBeenLastCalledWith(false);
        expect(onChange).toHaveBeenCalledTimes(2);
        stop();
    });

    it("input keeps you online", async () => {
        const target = new EventTarget() as unknown as Window;
        const onChange = vi.fn();
        const stop = startAwayTracker(onChange, { target });
        for (let minute = 0; minute < 30; minute += 1) {
            await vi.advanceTimersByTimeAsync(60_000);
            target.dispatchEvent(new Event("keydown"));
        }
        expect(onChange).not.toHaveBeenCalled();
        stop();
    });

    it("uses the computer's idle time on desktop, so working in another app counts", async () => {
        const target = new EventTarget() as unknown as Window;
        const onChange = vi.fn();
        let systemIdle = 0;
        const stop = startAwayTracker(onChange, { target, systemIdleMs: async () => systemIdle });
        await vi.advanceTimersByTimeAsync(AWAY_AFTER_MS * 2);
        expect(onChange).not.toHaveBeenCalled();
        systemIdle = AWAY_AFTER_MS;
        await vi.advanceTimersByTimeAsync(15_000);
        expect(onChange).toHaveBeenLastCalledWith(true);
        systemIdle = 1_000;
        await vi.advanceTimersByTimeAsync(15_000);
        expect(onChange).toHaveBeenLastCalledWith(false);
        stop();
    });
});
