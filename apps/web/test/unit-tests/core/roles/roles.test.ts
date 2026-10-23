// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { allowedViewers, applyRolesToPowerLevels, memberRank, parseChannelTalk, parseRoles, type Role } from "../../../../src/core/roles/roles";

const roles: Role[] = parseRoles({
    roles: [
        { id: "member", name: "Member", color: "#2ecc71", rank: 10, permissions: ["invite"] },
        { id: "mod", name: "Moderator", color: "#ff7a1a", rank: 50, permissions: ["kick", "manage_messages", "pin_messages"] },
        { id: "bad", name: "Broken", color: "red", rank: 500, permissions: ["kick", "fly"] },
    ],
});

const basePowerLevels = {
    users: { "@owner:hs": 100, "@old:hs": 25 },
    users_default: 0,
    kick: 50,
    ban: 50,
    redact: 50,
    invite: 0,
    events: { "m.room.name": 50 },
    state_default: 50,
};

describe("roles", () => {
    it("parses roles, clamping ranks and dropping unknown permissions, highest first", () => {
        expect(roles.map((role) => role.id)).toEqual(["bad", "mod", "member"]);
        expect(roles[0]).toMatchObject({ rank: 99, color: "#99aab5", permissions: ["kick"] });
    });

    it("gives each member their highest role's rank", () => {
        expect(memberRank(["member", "mod"], roles)).toBe(50);
        expect(memberRank([], roles)).toBe(0);
    });

    it("sets member levels and permission minimums, never touching admins or people above you", () => {
        const next = applyRolesToPowerLevels({
            current: basePowerLevels,
            roles: roles.filter((role) => role.id !== "bad"),
            assignments: new Map([
                ["@owner:hs", ["member"]],
                ["@alice:hs", ["mod"]],
                ["@bob:hs", ["member"]],
                ["@old:hs", []],
            ]),
            ownLevel: 100,
            scope: "space",
        });
        expect(next.users).toEqual({ "@owner:hs": 100, "@alice:hs": 50, "@bob:hs": 10 });
        expect(next).toMatchObject({ kick: 50, redact: 50, invite: 10, ban: 50 });
        expect((next.events as Record<string, number>)["m.room.pinned_events"]).toBe(50);
        expect(basePowerLevels.users).toEqual({ "@owner:hs": 100, "@old:hs": 25 }); // input untouched
    });

    it("caps everything below your own level", () => {
        const next = applyRolesToPowerLevels({
            current: basePowerLevels,
            roles,
            assignments: new Map([["@alice:hs", ["bad"]]]),
            ownLevel: 60,
            scope: "channel",
        });
        expect((next.users as Record<string, number>)["@alice:hs"]).toBe(59);
        expect(next.kick).toBe(50);
    });

    it("limits channel viewers to people with an allowed role", () => {
        const assignments = new Map([
            ["@alice:hs", ["mod"]],
            ["@bob:hs", ["member"]],
        ]);
        expect(allowedViewers(null, assignments)).toBeNull();
        expect([...allowedViewers(["mod"], assignments)!]).toEqual(["@alice:hs"]);
    });

    it("limits talking in a channel to a role and those ranked above it, and opens it again for everyone", () => {
        const input = { current: basePowerLevels, roles, assignments: new Map(), ownLevel: 100, scope: "channel" as const };
        expect(applyRolesToPowerLevels({ ...input, talkRank: 50 })).toMatchObject({ events_default: 50 });
        expect(applyRolesToPowerLevels({ ...input, talkRank: 50 }).events).not.toHaveProperty(["org.matrix.msc3401.call.member"]);
        // Voice channels: joining the call is talking too.
        expect(applyRolesToPowerLevels({ ...input, talkRank: 10, voiceChannel: true })).toMatchObject({
            events_default: 10,
            events: { "org.matrix.msc3401.call.member": 10 },
        });
        expect(applyRolesToPowerLevels({ ...input, talkRank: 0 })).toMatchObject({ events_default: 0 });
        // Never above your own level, and untouched when no choice was made.
        expect(applyRolesToPowerLevels({ ...input, ownLevel: 30, talkRank: 50 })).toMatchObject({ events_default: 29 });
        expect(applyRolesToPowerLevels(input)).not.toHaveProperty("events_default");
        expect(applyRolesToPowerLevels({ ...input, scope: "space", talkRank: 50 })).not.toHaveProperty("events_default");
    });

    it("reads who may talk, ignoring unknown roles", () => {
        expect(parseChannelTalk({ talk: "mod" }, roles)).toBe("mod");
        expect(parseChannelTalk({ talk: "everyone" }, roles)).toBe("everyone");
        expect(parseChannelTalk({ talk: "gone" }, roles)).toBeNull();
        expect(parseChannelTalk({ roles: ["mod"] }, roles)).toBeNull();
    });
});
