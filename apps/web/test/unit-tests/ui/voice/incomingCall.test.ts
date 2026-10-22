// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { MatrixEvent } from "matrix-js-sdk/src/matrix";

import { incomingCallExpiry } from "../../../../src/ui/hooks/useIncomingCall";

const notification = (ts: number, content: Record<string, unknown>): MatrixEvent =>
    ({ getTs: () => ts, getContent: () => content }) as unknown as MatrixEvent;

describe("incoming call ringing window", () => {
    it("rings for a fresh notification until its lifetime ends", () => {
        expect(incomingCallExpiry(notification(1_000, { sender_ts: 1_000, lifetime: 30_000 }), 5_000)).toBe(31_000);
    });

    it("never rings for an old notification (replayed at startup)", () => {
        expect(incomingCallExpiry(notification(1_000, { sender_ts: 1_000, lifetime: 30_000 }), 60_000)).toBeNull();
    });

    it("defaults to 30 s and caps very long lifetimes at 90 s", () => {
        expect(incomingCallExpiry(notification(0, {}), 1)).toBe(30_000);
        expect(incomingCallExpiry(notification(0, { sender_ts: 0, lifetime: 10_000_000 }), 1)).toBe(90_000);
    });

    it("doesn't trust a sender clock set in the future", () => {
        expect(incomingCallExpiry(notification(1_000, { sender_ts: 999_999_999, lifetime: 30_000 }), 2_000)).toBe(31_000);
    });
});
