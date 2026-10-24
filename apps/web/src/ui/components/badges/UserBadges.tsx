// SPDX-License-Identifier: AGPL-3.0-only
// Badges after someone's name (members list, messages, profiles). Official ones (core/badges/badges.ts) show as
// icons; badges claimed any other way sit behind a "..." marked as not from Meadhall.
import React, { useEffect, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { BADGES, UNOFFICIAL_BADGES_FIELD, officialBadgesFor, onBadgeListChange, parseClaimedBadges, type BadgeId } from "../../../core/badges/badges";
import { useIconStyle } from "../../theme/iconStyle";

// A gold coin with an F. o = rim, g = gold, h = shine, F = the letter.
const FOUNDER_PIXELS = [
    "...oooooo...",
    ".oohhggggoo.",
    ".ohgggggggo.",
    "oggFFFFFgggo",
    "oggFgggggggo",
    "oggFgggggggo",
    "oggFFFFggggo",
    "oggFgggggggo",
    "oggFgggggggo",
    ".ogFggggggo.",
    ".ooggggggoo.",
    "...oooooo...",
];
const FOUNDER_COLORS: Record<string, string> = { o: "#8a5a00", g: "#f5c542", h: "#fff3b0", F: "#7a4300" };

function FounderCoin({ size }: { size: number }): React.ReactElement {
    const style = useIconStyle();
    if (style === "smooth") {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="badge-icon">
                <defs>
                    <radialGradient id="founder-gold" cx="35%" cy="30%" r="75%">
                        <stop offset="0%" stopColor="#fff3b0" />
                        <stop offset="45%" stopColor="#f5c542" />
                        <stop offset="100%" stopColor="#b8860b" />
                    </radialGradient>
                </defs>
                <circle cx="12" cy="12" r="10.5" fill="url(#founder-gold)" stroke="#8a5a00" strokeWidth="1.5" />
                <path d="M9.5 7.5h5.5M9.5 7.5v9M9.5 12h4" stroke="#7a4300" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
        );
    }
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true" className="badge-icon">
            {FOUNDER_PIXELS.flatMap((row, y) =>
                [...row].map((cell, x) => (FOUNDER_COLORS[cell] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={FOUNDER_COLORS[cell]} /> : null)),
            )}
        </svg>
    );
}

const ICONS: Record<BadgeId, (props: { size: number }) => React.ReactElement> = { founder: FounderCoin };

// Claimed badges from profiles, re-read at most every 10 minutes per person.
const claimedCache = new Map<string, { at: number; value: Promise<string[]> }>();
function claimedBadges(client: MatrixClient, userId: string): Promise<string[]> {
    const cached = claimedCache.get(userId);
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
    const value = client
        .getExtendedProfileProperty(userId, UNOFFICIAL_BADGES_FIELD)
        .then(parseClaimedBadges)
        .catch(() => []);
    claimedCache.set(userId, { at: Date.now(), value });
    return value;
}

export function useUserBadges(client: MatrixClient, userId: string | null | undefined): { official: BadgeId[]; unofficial: string[] } {
    const [official, setOfficial] = useState<BadgeId[]>([]);
    const [unofficial, setUnofficial] = useState<string[]>([]);
    const [listVersion, setListVersion] = useState(0);
    useEffect(() => onBadgeListChange(() => setListVersion((value) => value + 1)), []);
    useEffect(() => {
        if (!userId) return undefined;
        let cancelled = false;
        void Promise.all([officialBadgesFor(userId), claimedBadges(client, userId)]).then(([verified, claimed]) => {
            if (cancelled) return;
            setOfficial(verified);
            // A claim matching an official badge they really have isn't "unofficial".
            const officialLabels = new Set(verified.map((badge) => BADGES[badge].label.toLowerCase()));
            setUnofficial(claimed.filter((label) => !officialLabels.has(label.toLowerCase())));
        });
        return () => {
            cancelled = true;
        };
    }, [client, listVersion, userId]);
    return { official, unofficial };
}

export function UserBadges({ client, userId, size = 14 }: { client: MatrixClient; userId: string; size?: number }): React.ReactElement | null {
    const { official, unofficial } = useUserBadges(client, userId);
    if (official.length === 0 && unofficial.length === 0) return null;
    return (
        <span className="user-badges" data-testid="user-badges">
            {official.map((badge) => {
                const Icon = ICONS[badge];
                return (
                    <span key={badge} className="user-badge" title={`${BADGES[badge].label}: ${BADGES[badge].description}`} role="img" aria-label={BADGES[badge].label} data-badge={badge}>
                        <Icon size={size} />
                    </span>
                );
            })}
            {unofficial.length > 0 ? (
                <span
                    className="user-badge user-badge-unofficial"
                    title={`Unofficial badges, not from Meadhall: ${unofficial.join(", ")}`}
                    role="img"
                    aria-label={`Unofficial badges, not from Meadhall: ${unofficial.join(", ")}`}
                    data-testid="unofficial-badges"
                >
                    …
                </span>
            ) : null}
        </span>
    );
}
