// SPDX-License-Identifier: AGPL-3.0-only
// Edit per-server profile (server right-click menu): a name and picture only people in that server see, like
// Discord's server nicknames. It's your Matrix member profile in the server and each of its channels you've joined,
// so Element shows it too. Changing your main profile later replaces it (Synapse updates every room).
import React, { useEffect, useState } from "react";
import { EventType, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import { RoomDialog } from "./RoomDialog";

interface ServerProfileDialogProps {
    client: MatrixClient;
    space: Room | null;
    channels: Room[];
    onClose: () => void;
    onToast: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

async function setMemberProfile(client: MatrixClient, room: Room, profile: { displayname?: string; avatar_url?: string }): Promise<void> {
    const userId = client.getSafeUserId();
    const current = room.currentState.getStateEvents(EventType.RoomMember, userId)?.getContent() ?? { membership: "join" };
    await client.sendStateEvent(room.roomId, EventType.RoomMember, { ...current, ...profile, membership: "join" } as never, userId);
}

export function ServerProfileDialog({ client, space, channels, onClose, onToast }: ServerProfileDialogProps): React.ReactElement | null {
    const userId = client.getUserId() ?? "";
    const member = space?.getMember(userId);
    const [name, setName] = useState("");
    const [avatar, setAvatar] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setName(member?.rawDisplayName ?? "");
        setAvatar(null);
        setError(null);
    }, [member?.rawDisplayName, space?.roomId]);

    if (!space) return null;
    const rooms = [space, ...channels.filter((room) => room.getMyMembership() === "join")];

    const apply = async (profile: { displayname?: string; avatar_url?: string }, done: string): Promise<void> => {
        setSaving(true);
        setError(null);
        try {
            for (const room of rooms) await setMemberProfile(client, room, profile);
            onToast({ type: "success", message: done });
            onClose();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Couldn't save your server profile.");
        } finally {
            setSaving(false);
        }
    };

    const save = async (): Promise<void> => {
        const profile: { displayname?: string; avatar_url?: string } = {};
        if (name.trim()) profile.displayname = name.trim().slice(0, 64);
        if (avatar) {
            if (!avatar.type.startsWith("image/") || avatar.size > MAX_AVATAR_BYTES) {
                setError("Pick an image of 8 MB or less.");
                return;
            }
            setSaving(true);
            try {
                profile.avatar_url = (await client.uploadContent(avatar, { type: avatar.type, name: avatar.name })).content_uri;
            } catch (uploadError) {
                setSaving(false);
                setError(uploadError instanceof Error ? uploadError.message : "Couldn't upload the picture.");
                return;
            }
        }
        await apply(profile, `Your profile in ${space.name} is saved.`);
    };

    const reset = async (): Promise<void> => {
        const global = await client.getProfileInfo(userId).catch(() => ({}) as { displayname?: string; avatar_url?: string });
        await apply({ displayname: global.displayname ?? undefined, avatar_url: global.avatar_url ?? undefined }, "Back to your main profile in this server.");
    };

    return (
        <RoomDialog
            open
            title={`Your profile in ${space.name}`}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="room-dialog-button room-dialog-button-secondary" onClick={() => void reset()} disabled={saving}>
                        Use my main profile
                    </button>
                    <button type="button" className="room-dialog-button room-dialog-button-primary" onClick={() => void save()} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                    </button>
                </>
            }
        >
            <p className="room-dialog-muted">Only people in this server see this name and picture.</p>
            <label className="room-dialog-field">
                <span>Server nickname</span>
                <input className="room-dialog-input" type="text" maxLength={64} value={name} onChange={(event) => setName(event.target.value)} disabled={saving} />
            </label>
            <label className="room-dialog-field">
                <span>Server picture (optional)</span>
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => setAvatar(event.target.files?.[0] ?? null)} disabled={saving} />
            </label>
            {error ? <p className="room-dialog-error">{error}</p> : null}
        </RoomDialog>
    );
}
