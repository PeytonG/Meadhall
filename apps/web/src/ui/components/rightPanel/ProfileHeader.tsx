import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "../Avatar";
import type { PresenceVm } from "../../presence/buildPresenceVm";
import { toAvatarPresenceState } from "../../presence/buildPresenceVm";
import { PresenceText } from "../presence/PresenceText";
import { BannerImage } from "./BannerImage";
import { DEFAULT_BANNER_CROP, type BannerCrop } from "../../../core/profile/richProfile";
import { CloseIcon } from "../CloseIcon";

interface ProfileHeaderProps {
    displayName: string;
    // Badges after the name (UserBadges).
    badges?: React.ReactNode;
    userId: string;
    avatarSources: string[];
    // Their uploaded banner (image or GIF); otherwise a gradient from their user ID.
    bannerUrl?: string | null;
    bannerCrop?: BannerCrop;
    presence: PresenceVm | null;
    onBack: () => void;
    onCopyMxid: () => Promise<void>;
    onCopyUserId: () => Promise<void>;
    onMessage?: () => Promise<void>;
    onCall?: () => void;
}

function hashToHue(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
        hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) % 360;
}

export function ProfileHeader({
    displayName,
    badges,
    userId,
    avatarSources,
    bannerUrl,
    bannerCrop = DEFAULT_BANNER_CROP,
    presence,
    onBack,
    onCopyMxid,
    onCopyUserId,
    onMessage,
    onCall,
}: ProfileHeaderProps): React.ReactElement {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const hue = useMemo(() => hashToHue(userId), [userId]);
    const bannerStyle = useMemo(
        () => ({
            background: `linear-gradient(135deg, hsl(${hue} 62% 42%), hsl(${(hue + 48) % 360} 55% 28%))`,
        }),
        [hue],
    );

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }

        const onMouseDown = (event: MouseEvent): void => {
            const target = event.target as Node | null;
            if (!target || menuRef.current?.contains(target)) {
                return;
            }
            setMenuOpen(false);
        };

        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        };

        window.addEventListener("mousedown", onMouseDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [menuOpen]);

    // The panel clips overflow, so the menu is fixed to the window and kept inside it.
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const menuPanelRef = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
        if (!menuOpen) {
            setMenuPosition(null);
            return;
        }
        const button = menuRef.current?.querySelector("button")?.getBoundingClientRect();
        const panel = menuPanelRef.current?.getBoundingClientRect();
        if (!button || !panel) return;
        const margin = 8;
        const left = Math.min(Math.max(margin, button.right - panel.width), window.innerWidth - panel.width - margin);
        const below = button.bottom + 6;
        const top = below + panel.height > window.innerHeight - margin ? Math.max(margin, button.top - 6 - panel.height) : below;
        setMenuPosition({ top, left });
    }, [menuOpen]);

    return (
        <header className="rp-profile-hero">
            <div className="rp-profile-banner" style={bannerStyle} data-testid="profile-banner">
                {bannerUrl ? <BannerImage className="rp-profile-banner-image" url={bannerUrl} crop={bannerCrop} /> : null}
            </div>
            <button type="button" className="rp-profile-close" onClick={onBack} aria-label="Close profile">
                <CloseIcon />
            </button>
            <Avatar
                className="rp-profile-avatar"
                name={displayName}
                src={avatarSources[0] ?? null}
                sources={avatarSources}
                seed={userId}
                userId={userId}
                presenceState={toAvatarPresenceState(presence)}
            />
            <div className="rp-profile-main">
                {/* The name shortens with "…" when long; the badges sit outside it so they're never cut off. */}
                <div className="rp-profile-name-row">
                    <h2 className="rp-profile-name" title={displayName}>
                        {displayName}
                    </h2>
                    {badges}
                </div>
                <div className="rp-profile-mxid">{userId}</div>
                {presence ? <PresenceText presence={presence} className="rp-profile-presence" /> : null}
            </div>
            <div className="rp-profile-actions">
                {onMessage ? (
                    <button type="button" className="rp-icon-btn rp-icon-btn-primary" onClick={() => void onMessage()}>
                        Message
                    </button>
                ) : null}
                <button
                    type="button"
                    className="rp-icon-btn"
                    disabled={!onCall}
                    onClick={onCall}
                    title={onCall ? "Start a call" : undefined}
                    data-testid="profile-call"
                >
                    Call
                </button>
                <button type="button" className="rp-icon-btn" disabled>
                    Add
                </button>
                <div className="rp-profile-menu" ref={menuRef}>
                    <button
                        type="button"
                        className="rp-icon-btn"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((open) => !open)}
                    >
                        ...
                    </button>
                    {menuOpen ? (
                        <div
                            className="rp-profile-menu-panel"
                            role="menu"
                            ref={menuPanelRef}
                            style={menuPosition ?? { visibility: "hidden" }}
                        >
                            <button
                                type="button"
                                className="rp-profile-menu-item"
                                role="menuitem"
                                onClick={() => {
                                    void onCopyMxid();
                                    setMenuOpen(false);
                                }}
                            >
                                Copy MXID
                            </button>
                            <button
                                type="button"
                                className="rp-profile-menu-item"
                                role="menuitem"
                                onClick={() => {
                                    void onCopyUserId();
                                    setMenuOpen(false);
                                }}
                            >
                                Copy user ID
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
