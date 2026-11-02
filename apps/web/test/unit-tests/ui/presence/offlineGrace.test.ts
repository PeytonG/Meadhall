// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { buildPresenceVm } from "../../../../src/ui/presence/buildPresenceVm";
import { OFFLINE_GRACE_MS, withOfflineGrace } from "../../../../src/ui/presence/usePresence";

const online = buildPresenceVm({ presence: "online", currentlyActive: true });
const offline = buildPresenceVm({ presence: "offline" });

describe("offline grace", () => {
    it("keeps showing online through a brief blink, then goes offline if it lasts", () => {
        const first = withOfflineGrace(online, undefined, 0).next;
        const blink = withOfflineGrace(offline, first, 1_000);
        expect(blink.holding).toBe(true);
        expect(blink.next.vm.state).toBe("online");
        const back = withOfflineGrace(online, blink.next, 1_500);
        expect(back.next.vm.state).toBe("online");
        expect(back.next.droppedAt).toBeNull();

        const stillOff = withOfflineGrace(offline, blink.next, 1_000 + OFFLINE_GRACE_MS);
        expect(stillOff.holding).toBe(false);
        expect(stillOff.next.vm.state).toBe("offline");
    });

    it("shows offline straight away for someone who wasn't online", () => {
        expect(withOfflineGrace(offline, undefined, 0).next.vm.state).toBe("offline");
    });
});
