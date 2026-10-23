import React from "react";

import type { ServerRoles } from "../mutualServerRoles";

interface RolesCardProps {
    servers: ServerRoles[];
    mutualRoomsCount: number;
}

// Like Discord's profile: the person's roles in every server you share, with the server's name.
export function RolesCard({ servers, mutualRoomsCount }: RolesCardProps): React.ReactElement {
    return (
        <section className="rp-card" data-testid="profile-roles">
            <header className="rp-card-header">
                <h3 className="rp-card-title">Roles in mutual servers</h3>
            </header>
            {servers.length === 0 ? <p className="rp-row-value">No servers in common.</p> : null}
            {servers.map((server) => (
                <div className="rp-server-roles" key={server.serverId}>
                    <span className="rp-server-roles-name">{server.serverName}</span>
                    <div className="rp-server-roles-list">
                        {server.roles.length === 0 ? <span className="rp-role-chip is-none">No roles</span> : null}
                        {server.roles.map((role) => (
                            <span className="rp-role-chip" key={role.id}>
                                <span className="rp-role-chip-dot" style={{ background: role.color }} aria-hidden="true" />
                                {role.name}
                            </span>
                        ))}
                    </div>
                </div>
            ))}
            <div className="rp-row">
                <span className="rp-row-label">Mutual rooms</span>
                <span className="rp-row-value">{mutualRoomsCount}</span>
            </div>
        </section>
    );
}
