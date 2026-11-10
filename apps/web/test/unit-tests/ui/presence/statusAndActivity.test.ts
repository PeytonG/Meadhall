// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { buildPresenceVm } from "../../../../src/ui/presence/buildPresenceVm";

const playing = { state: null, platform: "desktop" as const, activity: { name: "Call of Duty", since: 1, kind: "playing" as const } };

describe("status and activity", () => {
    it("shows both a custom status and what someone is playing", () => {
        const vm = buildPresenceVm({ presence: "online", statusMessage: "ZzZzZzZ", published: playing });
        expect(vm.statusText).toBe("ZzZzZzZ");
        expect(vm.activityText).toBe("Playing Call of Duty");
    });

    it("shows the game alone when there's no custom status, without repeating it", () => {
        expect(buildPresenceVm({ presence: "online", published: playing })).toMatchObject({ statusText: "Playing Call of Duty", activityText: null });
        // Meadhall also puts the game in the plain status when there's no custom one.
        expect(buildPresenceVm({ presence: "online", statusMessage: "Playing Call of Duty", published: playing })).toMatchObject({ activityText: null });
    });

    it("doesn't show a game for someone offline", () => {
        expect(buildPresenceVm({ presence: "offline", statusMessage: "ZzZzZzZ", published: playing }).activityText).toBeNull();
    });

    // The homeserver keeps the last status message after someone leaves or goes invisible: closing Meadhall mid-game
    // used to leave "Playing ..." under their name for good.
    it("shows no status at all for someone offline or invisible, even a leftover Playing message", () => {
        for (const presence of ["offline", "unknown"] as const) {
            const vm = buildPresenceVm({ presence, statusMessage: "Playing Call of Duty", published: playing });
            expect(vm.statusText).toBeNull();
            expect(vm.activityText).toBeNull();
        }
        expect(buildPresenceVm({ presence: "offline", statusMessage: "ZzZzZzZ" }).statusText).toBeNull();
    });

    it("still shows the status of someone away", () => {
        expect(buildPresenceVm({ presence: "unavailable", statusMessage: "Playing Call of Duty" }).statusText).toBe("Playing Call of Duty");
    });
});
