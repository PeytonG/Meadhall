// SPDX-License-Identifier: AGPL-3.0-only
// Hovering someone who is screen sharing in the channel list: "Streaming Now" with their latest snapshot
// (core/voice/streamPreview.ts) and a Watch Stream button, like Discord's.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RoomEvent, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import { STREAM_PREVIEW_EVENT, latestStreamPreview, streamPreviewUrl } from "../../../core/voice/streamPreview";

interface StreamHoverCardProps {
    client: MatrixClient;
    room: Room;
    userId: string;
    name: string;
    live: boolean;
    onWatch: () => void;
    children: React.ReactNode;
}

export function StreamHoverCard({ client, room, userId, name, live, onWatch, children }: StreamHoverCardProps): React.ReactElement {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const [image, setImage] = useState<string | null>(null);
    const closeTimer = useRef<number | null>(null);

    const keepOpen = (): void => {
        if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
    };
    const closeSoon = (): void => {
        keepOpen();
        closeTimer.current = window.setTimeout(() => setAnchor(null), 200);
    };

    useEffect(() => {
        if (!anchor) return undefined;
        let cancelled = false;
        const load = (): void => {
            const event = latestStreamPreview(room, userId);
            if (!event) {
                setImage(null);
                return;
            }
            void streamPreviewUrl(client, event).then((url) => {
                if (!cancelled) setImage(url);
            });
        };
        const onTimeline = (event: MatrixEvent, eventRoom: Room | undefined): void => {
            if (eventRoom?.roomId === room.roomId && event.getType() === STREAM_PREVIEW_EVENT && event.getSender() === userId) load();
        };
        load();
        client.on(RoomEvent.Timeline, onTimeline);
        return () => {
            cancelled = true;
            client.off(RoomEvent.Timeline, onTimeline);
        };
    }, [anchor, client, room, userId]);

    useEffect(() => () => keepOpen(), []);

    if (!live) return <>{children}</>;
    const top = anchor ? Math.min(anchor.top, window.innerHeight - 250) : 0;
    const left = anchor ? Math.min(anchor.right + 8, window.innerWidth - 300) : 0;
    return (
        <span
            className="stream-hover-anchor"
            onMouseEnter={(event) => {
                keepOpen();
                const target = (event.target as HTMLElement).closest("button") ?? (event.currentTarget.firstElementChild as HTMLElement | null);
                if (target) setAnchor(target.getBoundingClientRect());
            }}
            onMouseLeave={closeSoon}
        >
            {children}
            {anchor
                ? createPortal(
                      <div className="stream-hover-card" role="dialog" aria-label={`${name} is streaming`} style={{ top, left }} onMouseEnter={keepOpen} onMouseLeave={closeSoon} data-testid="stream-hover-card">
                          <div className="stream-hover-header">
                              <span>Streaming Now</span>
                              <span className="room-item-voice-live-badge">LIVE</span>
                          </div>
                          <div className="stream-hover-preview">
                              {image ? <img src={image} alt={`${name}'s screen`} data-testid="stream-hover-image" /> : <span>{room.hasEncryptionStateEvent() ? "No preview in encrypted channels" : "Preview loading…"}</span>}
                          </div>
                          <button
                              type="button"
                              className="stream-hover-watch"
                              onClick={() => {
                                  setAnchor(null);
                                  onWatch();
                              }}
                          >
                              Watch Stream
                          </button>
                      </div>,
                      document.body,
                  )
                : null}
        </span>
    );
}
