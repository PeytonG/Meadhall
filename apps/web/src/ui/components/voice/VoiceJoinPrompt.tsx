// SPDX-License-Identifier: AGPL-3.0-only
// A voice channel you're not in (you left the call, or opened it without joining), like Discord's: the channel's
// name, who is in voice right now, and Join Voice, instead of an empty page.
import React, { useEffect, useState } from "react";
import { RoomStateEvent, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/src/matrixrtc";

import { getRtcVoiceParticipants } from "../../adapters/voiceAdapter";
import { thumbnailFromMxc } from "../../adapters/media";
import { Avatar } from "../Avatar";
import { PixelIcon } from "../PixelIcon";

function useVoiceMembers(client: MatrixClient, room: Room): string[] {
    const read = (): string[] => {
        try {
            return getRtcVoiceParticipants(client, room).participants.map((participant) => participant.matrixUserId ?? participant.identity);
        } catch {
            return [];
        }
    };
    const [members, setMembers] = useState<string[]>(read);

    useEffect(() => {
        setMembers(read());
        const session = client.matrixRTC.getRoomSession(room);
        const onChange = (): void => {
            const next = read();
            setMembers((current) => (current.length === next.length && current.every((id, index) => id === next[index]) ? current : next));
        };
        // The session's change event doesn't fire for calls you aren't in, so also follow the room's state and check
        // every few seconds (like the channel list).
        session.on(MatrixRTCSessionEvent.MembershipsChanged, onChange);
        room.currentState.on(RoomStateEvent.Events, onChange);
        const timer = window.setInterval(onChange, 3_000);
        return () => {
            session.off(MatrixRTCSessionEvent.MembershipsChanged, onChange);
            room.currentState.removeListener(RoomStateEvent.Events, onChange);
            window.clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, room]);
    return members;
}

export function VoiceJoinPrompt({ client, room, onJoin }: { client: MatrixClient; room: Room; onJoin: () => void }): React.ReactElement {
    const members = useVoiceMembers(client, room);
    return (
        <section className="voice-join-prompt" data-testid="voice-join-prompt" aria-label={`${room.name} voice channel`}>
            <PixelIcon name="voice" size={40} />
            <h2>{room.name}</h2>
            {members.length === 0 ? (
                <p>No one is currently in voice</p>
            ) : (
                <>
                    <div className="voice-join-avatars">
                        {members.slice(0, 8).map((userId) => {
                            const member = room.getMember(userId);
                            return (
                                <Avatar
                                    key={userId}
                                    className="voice-join-avatar"
                                    name={member?.name ?? userId}
                                    src={thumbnailFromMxc(client, member?.getMxcAvatarUrl() ?? null, 64, 64, "crop")}
                                    seed={userId}
                                    userId={userId}
                                />
                            );
                        })}
                    </div>
                    <p>
                        {members
                            .slice(0, 3)
                            .map((userId) => room.getMember(userId)?.name ?? userId)
                            .join(", ")}
                        {members.length > 3 ? ` and ${members.length - 3} more` : ""} {members.length === 1 ? "is" : "are"} in voice
                    </p>
                </>
            )}
            <button type="button" className="voice-join-button" onClick={onJoin} data-testid="voice-join">
                Join Voice
            </button>
        </section>
    );
}
