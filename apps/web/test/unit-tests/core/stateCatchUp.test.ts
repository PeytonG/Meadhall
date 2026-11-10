// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import { applyMissedStateEvent, refetchBrokenState } from "../../../src/core/matrix/stateCatchUp";

function roomHolding(current: MatrixEvent | null): { room: Room; applied: MatrixEvent[] } {
    const applied: MatrixEvent[] = [];
    const room = {
        roomId: "!voice:x",
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

describe("refetchBrokenState", () => {
    // Bob refreshed his call membership ($refresh) but that change was lost; we still hold $join. His leave says it
    // replaces $refresh, so it can't be applied as it is: ask the server what's current instead.
    it("asks the server when the change replaces an event we never got, and applies what it says", async () => {
        const { room, applied } = roomHolding(state("$join", { application: "m.call" }));
        const leave = state("$leave", {}, "$refresh");
        const asked: string[] = [];
        const changed = await refetchBrokenState(room, leave, async (roomId, type, key) => {
            asked.push(`${roomId} ${type} ${key}`);
            return leave;
        });
        expect(changed).toBe(true);
        expect(asked).toEqual(["!voice:x org.matrix.msc3401.call.member _@bob:x_DEV_m.call"]);
        expect(applied).toEqual([leave]);
    });

    it("doesn't ask when the chain is fine, and changes nothing when the server agrees or can't say", async () => {
        let asked = 0;
        const count = async (): Promise<null> => {
            asked += 1;
            return null;
        };
        expect(await refetchBrokenState(roomHolding(state("$old", {})).room, state("$new", {}, "$old"), count)).toBe(false);
        expect(asked).toBe(0);
        const holding = roomHolding(state("$join", {}));
        expect(await refetchBrokenState(holding.room, state("$leave", {}, "$refresh"), count)).toBe(false);
        expect(await refetchBrokenState(holding.room, state("$leave", {}, "$refresh"), async () => state("$join", {}))).toBe(false);
        expect(holding.applied).toEqual([]);
    });
});
