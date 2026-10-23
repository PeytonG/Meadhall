// SPDX-License-Identifier: AGPL-3.0-only
// The roles someone has in each server (space) you share with them, for their profile card.
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { MEMBER_ROLES_EVENT, ROLES_EVENT, memberRolesKey, parseMemberRoles, parseRoles } from "../../../core/roles/roles";

export interface ServerRoles {
    serverId: string;
    serverName: string;
    roles: Array<{ id: string; name: string; color: string }>;
}

export function mutualServerRoles(client: MatrixClient, userId: string): ServerRoles[] {
    return client
        .getRooms()
        .filter((room) => room.isSpaceRoom() && room.getMyMembership() === "join" && room.getMember(userId)?.membership === "join")
        .map((space) => {
            const state = space.currentState;
            const defined = parseRoles(state.getStateEvents(ROLES_EVENT, "")?.getContent());
            const assigned = new Set(parseMemberRoles(state.getStateEvents(MEMBER_ROLES_EVENT, memberRolesKey(userId))?.getContent(), defined));
            const roles = defined.filter((role) => assigned.has(role.id)).map(({ id, name, color }) => ({ id, name, color }));
            if (roles.length === 0) {
                // Servers without Meadhall roles (or people without one): fall back to the Matrix power level.
                // The member's power level counts room creators too (room v12 keeps them out of the power levels).
                const level = space.getMember(userId)?.powerLevel ?? 0;
                if (level >= 100) roles.push({ id: "pl-admin", name: "Admin", color: "#e0525a" });
                else if (level >= 50) roles.push({ id: "pl-mod", name: "Moderator", color: "#5aa9e6" });
            }
            return { serverId: space.roomId, serverName: space.name || "Unnamed server", roles };
        })
        .sort((left, right) => left.serverName.localeCompare(right.serverName));
}
