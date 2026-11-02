import React, { useCallback, useEffect, useMemo, useState } from "react";
import { type MatrixClient, type MatrixEvent, type Room, type RoomMember } from "matrix-js-sdk/src/matrix";

import { createOrReuseDirectChat, getDirectRoomIds } from "../../adapters/dmAdapter";
import { mediaFromMxc, thumbnailFromMxc } from "../../adapters/media";
import { useMatrix } from "../../providers/MatrixProvider";
import { isPresenceEnabledForClient } from "../../presence/presenceConfig";
import { usePresenceVm } from "../../presence/usePresence";
import { memberAvatarSources } from "../../adapters/avatar";
import { ProfileHeader } from "./ProfileHeader";
import { AboutCard } from "./cards/AboutCard";
import { RolesCard } from "./cards/RolesCard";
import { MediaCard } from "./cards/MediaCard";
import { mutualServerRoles } from "./mutualServerRoles";
import { useIgnoredUsers } from "../../hooks/useIgnoredUsers";
import { LinksCard } from "./cards/LinksCard";
import { parseRichProfile } from "../../../core/profile/richProfile";
import { isSentBugReport } from "../../../core/bugReport/bugReport";
import { UserBadges } from "../badges/UserBadges";
import { gradientColors, gradientCss } from "../../../core/profile/profileStyle";
import { useProfileStyle } from "../../profile/useProfileStyle";
import { useIconStyle } from "../../theme/iconStyle";
import { syncDesktopTitleBarColors } from "../../desktop/titleBarColors";
import { ReportDialog } from "../../moderation/ReportDialog";
import { friendStatus } from "../../../core/friends/friends";
import { runFriendAction, useFriends } from "../../friends/FriendsView";

interface UserProfilePanelProps {
    client: MatrixClient;
    room: Room;
    activeSpaceRoom: Room | null;
    userId: string;
    onBack: () => void;
    onOpenRoom: (roomId: string) => void;
    onToast?: (toast: { type: "success" | "error" | "info"; message: string }) => void;
    onCallUser?: (userId: string) => void;
}

interface UserProfileData {
    displayname?: string;
    avatar_url?: string;
    bio?: string;
    about?: string;
}

function getMemberSince(member: RoomMember | null): string | null {
    if (!member) {
        return null;
    }

    const memberEventTs = (member as RoomMember & { events?: { member?: MatrixEvent } }).events?.member?.getTs?.();
    if (!memberEventTs) {
        return null;
    }

    return new Date(memberEventTs).toLocaleDateString();
}

async function copyText(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const node = document.createElement("textarea");
    node.value = value;
    node.setAttribute("readonly", "true");
    node.style.position = "fixed";
    node.style.opacity = "0";
    document.body.appendChild(node);
    node.select();
    document.execCommand("copy");
    document.body.removeChild(node);
}

export function UserProfilePanel({
    client,
    room,
    activeSpaceRoom,
    userId,
    onBack,
    onOpenRoom,
    onToast,
    onCallUser,
}: UserProfilePanelProps): React.ReactElement {
    const [profile, setProfile] = useState<UserProfileData | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [reporting, setReporting] = useState(false);
    const { config } = useMatrix();
    const presenceEnabled = useMemo(() => isPresenceEnabledForClient(config, client), [client, config]);
    const presence = usePresenceVm(client, userId, presenceEnabled);

    const member = room.getMember(userId);
    const ownUserId = client.getUserId() ?? "";
    const directRoomIds = getDirectRoomIds(client);
    const isCurrentRoomDmWithUser = directRoomIds.has(room.roomId) && Boolean(room.getMember(userId));
    const canMessage = !isCurrentRoomDmWithUser && ownUserId !== userId;

    useEffect(() => {
        let cancelled = false;
        setLoadingProfile(true);

        client
            .getProfileInfo(userId)
            .then((nextProfile) => {
                if (cancelled) {
                    return;
                }
                setProfile(nextProfile as UserProfileData);
            })
            .catch(() => {
                if (!cancelled) {
                    setProfile(null);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingProfile(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [client, userId]);

    const displayName = profile?.displayname || member?.rawDisplayName || member?.name || userId;
    const profileAvatarMxc = profile?.avatar_url || member?.getMxcAvatarUrl() || null;
    const memberSources = memberAvatarSources(client, member, 176, "crop");
    const avatarSources = useMemo(
        () =>
            Array.from(
                new Set(
                    [
                        ...memberSources,
                        thumbnailFromMxc(client, profileAvatarMxc, 176, 176, "crop"),
                        mediaFromMxc(client, profileAvatarMxc),
                    ].filter((source): source is string => Boolean(source)),
                ),
            ),
        [client, memberSources, profileAvatarMxc],
    );

    const rich = useMemo(() => parseRichProfile(profile as Record<string, unknown> | null), [profile]);
    // Their profile style: the card's gradient.
    const iconStyle = useIconStyle();
    const cardColors = gradientColors(useProfileStyle(client, userId, true).card);
    // Desktop: the window controls over the card take its color (and go back when it closes).
    useEffect(() => {
        const frame = window.requestAnimationFrame(() => syncDesktopTitleBarColors());
        return () => {
            window.cancelAnimationFrame(frame);
            window.requestAnimationFrame(() => syncDesktopTitleBarColors());
        };
    }, [cardColors?.[0]]);
    const aboutText = useMemo(() => {
        if (rich.about.trim().length > 0) {
            return rich.about;
        }
        if (typeof profile?.about === "string" && profile.about.trim().length > 0) {
            return profile.about;
        }
        if (typeof profile?.bio === "string" && profile.bio.trim().length > 0) {
            return profile.bio;
        }
        return "";
    }, [profile?.about, profile?.bio, rich.about]);

    const memberSince = getMemberSince(member);
    const aboutBody = memberSince ? `${aboutText || "No bio set"}\n\nMember since ${memberSince}` : aboutText;

    const mutualRoomsCount = useMemo(
        () =>
            client
                .getRooms()
                .filter((candidate) => !candidate.isSpaceRoom() && !isSentBugReport(candidate, client.getUserId()))
                .filter((candidate) => candidate.getMember(userId)?.membership === "join")
                .length,
        [client, userId],
    );

    const { ignored, setIgnored } = useIgnoredUsers(client);
    const friends = useFriends(client);
    const relation = friendStatus(friends, userId);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    // The box at the bottom of the card: sends straight to your DM with them (made if needed) and opens it.
    const sendDraft = async (): Promise<void> => {
        const body = draft.trim();
        if (!body || sending) return;
        setSending(true);
        try {
            const result = await createOrReuseDirectChat(client, userId);
            await client.sendTextMessage(result.roomId, body);
            setDraft("");
            onOpenRoom(result.roomId);
        } catch (error) {
            onToast?.({ type: "error", message: error instanceof Error ? error.message : "Couldn't send the message." });
        } finally {
            setSending(false);
        }
    };
    const isBlocked = ignored.includes(userId);
    const serverRoles = useMemo(() => mutualServerRoles(client, userId), [client, userId, room]);

    const openDm = useCallback(async (): Promise<void> => {
        if (!canMessage) {
            return;
        }

        try {
            const result = await createOrReuseDirectChat(client, userId);
            onOpenRoom(result.roomId);
            onToast?.({
                type: "success",
                message: result.created ? "Direct message created." : "Opened direct message.",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to create direct message.";
            onToast?.({ type: "error", message });
        }
    }, [canMessage, client, onOpenRoom, onToast, userId]);

    return (
        <div
            className={`right-panel-body right-panel-body-user${cardColors ? " has-card-style" : ""}`}
            style={cardColors ? { backgroundImage: gradientCss(cardColors, { pixel: iconStyle === "pixel" }) } : undefined}
            data-titlebar-color={cardColors?.[0]}
            data-testid="profile-card"
        >
            <ProfileHeader
                displayName={displayName}
                badges={<UserBadges client={client} userId={userId} size={18} />}
                userId={userId}
                avatarSources={avatarSources}
                bannerUrl={rich.bannerMxc ? mediaFromMxc(client, rich.bannerMxc) : null}
                bannerCrop={rich.bannerCrop}
                presence={presenceEnabled ? presence : null}
                onBack={onBack}
                onMessage={canMessage ? openDm : undefined}
                onCall={onCallUser && ownUserId !== userId ? () => onCallUser(userId) : undefined}
                friend={
                    ownUserId === userId
                        ? undefined
                        : relation === "friends"
                          ? { label: "Friends" }
                          : relation === "outgoing"
                            ? { label: "Pending" }
                            : relation === "incoming"
                              ? { label: "Accept friend", onClick: () => void runFriendAction(client, userId, "accept", onToast) }
                              : { label: "Add friend", onClick: () => void runFriendAction(client, userId, "request", onToast) }
                }
                onCopyMxid={async () => {
                    await copyText(userId);
                    onToast?.({ type: "success", message: "MXID copied." });
                }}
                onCopyUserId={async () => {
                    await copyText(userId);
                    onToast?.({ type: "success", message: "User ID copied." });
                }}
            />

            <AboutCard
                title="About me"
                body={aboutBody}
                emptyText={loadingProfile ? "Loading profile..." : "No bio set."}
            />

            {rich.email || rich.links.length > 0 ? <LinksCard email={rich.email} links={rich.links} /> : null}

            <RolesCard servers={serverRoles} mutualRoomsCount={mutualRoomsCount} />

            <MediaCard title="Media" description="Recent images by this user will be shown here." />

            {canMessage ? (
                <form
                    className="rp-card rp-message-box"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void sendDraft();
                    }}
                >
                    <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={`Message @${displayName}`}
                        aria-label={`Message ${displayName}`}
                        disabled={sending}
                        data-testid="profile-message-input"
                    />
                </form>
            ) : null}

            <section className="rp-card rp-footer-actions">
                {ownUserId !== userId ? (
                    <button
                        type="button"
                        className={`rp-row-button${isBlocked ? "" : " is-danger"}`}
                        data-testid="profile-block"
                        onClick={() => {
                            if (!isBlocked && !window.confirm(`Block ${displayName}? You won't see their messages or invites (until you unblock them in Settings → Privacy).`)) {
                                return;
                            }
                            void setIgnored(userId, !isBlocked)
                                .then(() => onToast?.({ type: "success", message: isBlocked ? `Unblocked ${displayName}.` : `Blocked ${displayName}.` }))
                                .catch((error: unknown) =>
                                    onToast?.({ type: "error", message: error instanceof Error ? error.message : "Couldn't update your block list." }),
                                );
                        }}
                    >
                        {isBlocked ? "Unblock" : "Block / Ignore"}
                    </button>
                ) : null}
                {/* Reports go to the server's moderators, so only in a server; in DMs there's no one to send them to yet
                    (homeserver-admin reports are on the roadmap, CLAUDE.md §10). */}
                {activeSpaceRoom && ownUserId !== userId ? (
                    <button type="button" className="rp-row-button is-danger" onClick={() => setReporting(true)} data-testid="profile-report">
                        Report
                    </button>
                ) : null}
            </section>
            {reporting && activeSpaceRoom ? (
                <ReportDialog
                    client={client}
                    space={activeSpaceRoom}
                    userId={userId}
                    onClose={() => setReporting(false)}
                    onDone={(message) => {
                        setReporting(false);
                        onToast?.({ type: "success", message });
                    }}
                />
            ) : null}
        </div>
    );
}
