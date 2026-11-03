// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import { applyMissedStateEvent } from "../../../src/core/matrix/stateCatchUp";

function roomHolding(current: MatrixEvent | null): { room: Room; applied: MatrixEvent[] } {
    const applied: MatrixEvent[] = [];
    const room = {
        currentState: {
            getStateEvents: () => current,
            setStateEvents: (events: MatrixEvent[]) => applied.push(...events),
        },
    } as unknown as Room;
    return { room, applied };
}

const state = (id: string, content: Record<string, unknown>, replaces?: string): MatrixEvent =>
    new MatrixEvent({
        event_id: id,
        type: "org.matrix.msc3401.call.member",
        state_key: "_@bob:x_DEV_m.call",
        sender: "@bob:x",
        content,
        ...(replaces ? { unsigned: { replaces_state: replaces } } : {}),
    });

describe("applyMissedStateEvent", () => {
    it("applies a timeline state event that replaces exactly what we hold", () => {
        const { room, applied } = roomHolding(state("$old", { application: "m.call" }));
        const leave = state("$new", {}, "$old");
        expect(applyMissedStateEvent(room, leave)).toBe(true);
        expect(applied).toEqual([leave]);
    });

    it("leaves state alone when it's already current or the chain doesn't match", () => {
        expect(applyMissedStateEvent(roomHolding(state("$new", {})).room, state("$new", {}, "$old"))).toBe(false);
        expect(applyMissedStateEvent(roomHolding(state("$other", {})).room, state("$new", {}, "$old"))).toBe(false);
        expect(applyMissedStateEvent(roomHolding(state("$old", {})).room, state("$new", {}))).toBe(false);
    });
});
