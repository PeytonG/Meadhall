// SPDX-License-Identifier: AGPL-3.0-only
// The public email and links someone put on their profile. Addresses were checked to be http(s) when parsed.
import React from "react";

import type { ProfileLink } from "../../../../core/profile/richProfile";

export function LinksCard({ email, links }: { email: string; links: ProfileLink[] }): React.ReactElement {
    return (
        <section className="rp-card" data-testid="profile-links">
            <header className="rp-card-header">
                <h3 className="rp-card-title">Contact &amp; links</h3>
            </header>
            <ul className="rp-links">
                {email ? (
                    <li>
                        <span className="rp-row-label">Email</span>
                        <a href={`mailto:${email}`}>{email}</a>
                    </li>
                ) : null}
                {links.map((link) => (
                    <li key={link.url}>
                        <span className="rp-row-label">{link.label}</span>
                        <a href={link.url} target="_blank" rel="noopener noreferrer nofollow">
                            {link.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
