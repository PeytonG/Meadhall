// SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { memberAvatarSources } from "../../adapters/avatar";
import type { IncomingCall } from "../../hooks/useIncomingCall";
import { startRinging } from "../../voice/ringtone";
import { Avatar } from "../Avatar";
import { PixelIcon } from "../PixelIcon";

interface IncomingCallCardProps {
    client: MatrixClient;
    call: IncomingCall;
    speakerId?: string;
    onJoin: () => void;
    onDismiss: () => void;
}

// "Bob is calling": shown (and ringing) for the person being called, never the caller.
export function IncomingCallCard({ client, call, speakerId, onJoin, onDismiss }: IncomingCallCardProps): React.ReactElement {
    const room = client.getRoom(call.roomId);
    const member = room?.getMember(call.callerId) ?? null;
    const callerName = member?.name ?? client.getUser(call.callerId)?.displayName ?? call.callerId;
    const isGroup = Boolean(room && room.getJoinedMemberCount() > 2);
    const avatarSources = memberAvatarSources(client, member, 96, "crop");

    useEffect(() => startRinging(speakerId), [call.eventId, speakerId]);

    // In the background (another window, or the desktop app in the tray): an OS notification too.
    useEffect(() => {
        if ((!document.hidden && document.hasFocus()) || typeof Notification === "undefined" || Notification.permission !== "granted") {
            return undefined;
        }
        const notification = new Notification(`${callerName} is calling`, {
            body: isGroup ? `Call in ${room?.name ?? "a group chat"}` : "Open Meadhall to join",
            tag: `call:${call.eventId}`,
            requireInteraction: true,
        });
        notification.onclick = () => {
            void window.heorotDesktop?.showWindow?.();
            window.focus();
            notification.close();
        };
        return () => notification.close();
    }, [call.eventId, callerName, isGroup, room?.name]);

    return (
        <div className="incoming-call-card" role="alertdialog" aria-label={`${callerName} is calling`} data-testid="incoming-call">
            <Avatar
                className="incoming-call-avatar"
                name={callerName}
                src={avatarSources[0] ?? null}
                sources={avatarSources}
                seed={call.callerId}
                userId={call.callerId}
            />
            <div className="incoming-call-text">
                <strong>{callerName}</strong>
                <span>{isGroup ? `is calling ${room?.name ?? "the group"}` : "is calling you"}</span>
            </div>
            <button type="button" className="incoming-call-join" onClick={onJoin} aria-label="Join call">
                <PixelIcon name="phone" size={18} />
                Join
            </button>
            <button type="button" className="incoming-call-dismiss" onClick={onDismiss} aria-label="Dismiss call">
                <PixelIcon name="hangup" size={18} />
            </button>
        </div>
    );
}
