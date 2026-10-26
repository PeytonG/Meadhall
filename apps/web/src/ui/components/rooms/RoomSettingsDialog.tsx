import React, { useEffect, useMemo, useState } from "react";
import {
    EventType,
    HistoryVisibility,
    JoinRule,
    type MatrixClient,
    type Room,
} from "matrix-js-sdk/src/matrix";

import { RoomDialog } from "./RoomDialog";
import { CHANNEL_TYPES, CHANNEL_TYPE_EVENT, getChannelType, setChannelType, type ChannelType } from "../../../core/rooms/channelType";
import { VOICE_CHAT_EVENT, isVoiceChatEnabled, setVoiceChat } from "../../../core/voice/voiceChat";
import { isVoiceChannelRoom } from "../../voice/voiceChannel";
import { getRoomDisplayName } from "./roomAdminUtils";

interface RoomSettingsDialogProps {
    client: MatrixClient;
    room: Room | null;
    open: boolean;
    onClose: () => void;
}

function normalizeJoinRule(value: string | undefined): JoinRule {
    if (value === JoinRule.Public || value === JoinRule.Restricted || value === JoinRule.Knock) {
        return value;
    }
    return JoinRule.Invite;
}

function normalizeHistoryVisibility(value: string | undefined): HistoryVisibility {
    if (
        value === HistoryVisibility.Invited ||
        value === HistoryVisibility.Joined ||
        value === HistoryVisibility.WorldReadable
    ) {
        return value;
    }
    return HistoryVisibility.Shared;
}

function getJoinRule(room: Room): JoinRule {
    const event = room.currentState.getStateEvents(EventType.RoomJoinRules, "");
    const content = event?.getContent() as { join_rule?: unknown } | undefined;
    return normalizeJoinRule(typeof content?.join_rule === "string" ? content.join_rule : undefined);
}

function getHistoryVisibility(room: Room): HistoryVisibility {
    const event = room.currentState.getStateEvents(EventType.RoomHistoryVisibility, "");
    const content = event?.getContent() as { history_visibility?: unknown } | undefined;
    return normalizeHistoryVisibility(typeof content?.history_visibility === "string" ? content.history_visibility : undefined);
}

function isRoomEncrypted(room: Room): boolean {
    return Boolean(room.currentState.getStateEvents(EventType.RoomEncryption, ""));
}

export function RoomSettingsDialog({ client, room, open, onClose }: RoomSettingsDialogProps): React.ReactElement | null {
    const [name, setName] = useState("");
    const [topic, setTopic] = useState("");
    const [joinRule, setJoinRule] = useState<JoinRule>(JoinRule.Invite);
    const [historyVisibility, setHistoryVisibility] = useState<HistoryVisibility>(HistoryVisibility.Shared);
    const [enableEncryption, setEnableEncryption] = useState(false);
    const [channelType, setChannelTypeState] = useState<ChannelType>("text");
    const [voiceChat, setVoiceChatState] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const myUserId = client.getUserId() ?? "";
    const roomLabel = room ? getRoomDisplayName(room) : "room";
    const currentlyEncrypted = useMemo(() => (room ? isRoomEncrypted(room) : false), [room]);

    const canEditName = Boolean(room && myUserId && room.currentState.maySendStateEvent(EventType.RoomName, myUserId));
    const canEditTopic = Boolean(room && myUserId && room.currentState.maySendStateEvent(EventType.RoomTopic, myUserId));
    const canEditJoinRule = Boolean(
        room && myUserId && room.currentState.maySendStateEvent(EventType.RoomJoinRules, myUserId),
    );
    const canEditHistoryVisibility = Boolean(
        room && myUserId && room.currentState.maySendStateEvent(EventType.RoomHistoryVisibility, myUserId),
    );
    const canEnableEncryption = Boolean(
        room && myUserId && !currentlyEncrypted && room.currentState.maySendStateEvent(EventType.RoomEncryption, myUserId),
    );

    const isVoice = isVoiceChannelRoom(room);
    // Channel types only mean something in a server (DMs and group chats are just chats).
    const isServerChannel = Boolean(room && room.currentState.getStateEvents(EventType.SpaceParent).length > 0);
    const canEditVoiceChat = Boolean(room && myUserId && room.currentState.maySendStateEvent(VOICE_CHAT_EVENT, myUserId));
    const canEditChannelType = Boolean(room && myUserId && room.currentState.maySendStateEvent(CHANNEL_TYPE_EVENT, myUserId));
    // The server the channel belongs to (its type is also listed there).
    const parentSpace = (channel: Room): Room | null => {
        const parentId = channel.currentState.getStateEvents(EventType.SpaceParent).find((event) => event.getContent()?.canonical)?.getStateKey()
            ?? channel.currentState.getStateEvents(EventType.SpaceParent)[0]?.getStateKey();
        return parentId ? client.getRoom(parentId) : null;
    };

    useEffect(() => {
        if (!open || !room) {
            return;
        }

        setName(room.name || "");
        setTopic(room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()?.topic ?? "");
        setJoinRule(getJoinRule(room));
        setHistoryVisibility(getHistoryVisibility(room));
        setEnableEncryption(isRoomEncrypted(room));
        setChannelTypeState(getChannelType(room, parentSpace(room)));
        setVoiceChatState(isVoiceChatEnabled(room));
        setSaving(false);
        setError(null);
    }, [open, room]);

    const submit = async (): Promise<void> => {
        if (!room) {
            setError("Select a room first.");
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const currentName = room.name || "";
            const currentTopic = room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()?.topic ?? "";
            const currentJoinRule = getJoinRule(room);
            const currentHistoryVisibility = getHistoryVisibility(room);
            const encryptedNow = isRoomEncrypted(room);

            if (canEditName && name.trim() !== currentName.trim()) {
                await client.setRoomName(room.roomId, name.trim());
            }

            if (canEditTopic && topic.trim() !== String(currentTopic).trim()) {
                await client.setRoomTopic(room.roomId, topic.trim());
            }

            if (canEditJoinRule && joinRule !== currentJoinRule) {
                await client.sendStateEvent(
                    room.roomId,
                    EventType.RoomJoinRules,
                    { join_rule: joinRule },
                    "",
                );
            }

            if (canEditHistoryVisibility && historyVisibility !== currentHistoryVisibility) {
                await client.sendStateEvent(
                    room.roomId,
                    EventType.RoomHistoryVisibility,
                    { history_visibility: historyVisibility },
                    "",
                );
            }

            if (isVoice && canEditVoiceChat && voiceChat !== isVoiceChatEnabled(room)) {
                await setVoiceChat(client, room.roomId, voiceChat);
            }

            if (!isVoice && canEditChannelType && channelType !== getChannelType(room, parentSpace(room))) {
                await setChannelType(client, room, parentSpace(room), channelType);
            }

            if (canEnableEncryption && enableEncryption && !encryptedNow) {
                await client.sendStateEvent(
                    room.roomId,
                    EventType.RoomEncryption,
                    { algorithm: "m.megolm.v1.aes-sha2" },
                    "",
                );
            }

            onClose();
        } catch (settingsError) {
            const message = settingsError instanceof Error ? settingsError.message : "Failed to update room settings.";
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <RoomDialog
            open={open}
            title={`Room settings: ${roomLabel}`}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="room-dialog-button room-dialog-button-secondary" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button type="button" className="room-dialog-button room-dialog-button-primary" onClick={() => void submit()} disabled={saving || !room}>
                        {saving ? "Saving..." : "Save"}
                    </button>
                </>
            }
        >
            <label className="room-dialog-field">
                <span>Room name</span>
                <input
                    className="room-dialog-input"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={saving || !canEditName}
                />
            </label>

            <label className="room-dialog-field">
                <span>Topic</span>
                <input
                    className="room-dialog-input"
                    type="text"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    disabled={saving || !canEditTopic}
                />
            </label>

            <div className="room-dialog-two-columns">
                <label className="room-dialog-field">
                    <span>Join rule</span>
                    <select
                        className="room-dialog-input"
                        value={joinRule}
                        onChange={(event) => setJoinRule(event.target.value as JoinRule)}
                        disabled={saving || !canEditJoinRule}
                    >
                        <option value={JoinRule.Invite}>Invite only</option>
                        <option value={JoinRule.Public}>Public</option>
                        <option value={JoinRule.Restricted}>Restricted</option>
                        <option value={JoinRule.Knock}>Knock</option>
                    </select>
                </label>

                <label className="room-dialog-field">
                    <span>History visibility</span>
                    <select
                        className="room-dialog-input"
                        value={historyVisibility}
                        onChange={(event) => setHistoryVisibility(event.target.value as HistoryVisibility)}
                        disabled={saving || !canEditHistoryVisibility}
                    >
                        <option value={HistoryVisibility.Shared}>Shared</option>
                        <option value={HistoryVisibility.Joined}>Joined</option>
                        <option value={HistoryVisibility.Invited}>Invited</option>
                        <option value={HistoryVisibility.WorldReadable}>World readable</option>
                    </select>
                </label>
            </div>

            {isVoice ? (
                <label className="room-dialog-checkbox">
                    <input
                        type="checkbox"
                        checked={voiceChat}
                        onChange={(event) => setVoiceChatState(event.target.checked)}
                        disabled={saving || !canEditVoiceChat}
                        data-testid="voice-chat-toggle"
                    />
                    Text chat in this voice channel (shown below the call)
                </label>
            ) : isServerChannel ? (
                <label className="room-dialog-field">
                    <span>Channel type</span>
                    <select
                        className="room-dialog-input"
                        value={channelType}
                        onChange={(event) => setChannelTypeState(event.target.value as ChannelType)}
                        disabled={saving || !canEditChannelType}
                    >
                        {CHANNEL_TYPES.map((option) => (
                            <option key={option.type} value={option.type}>
                                {option.label}: {option.description}
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}

            <label className="room-dialog-checkbox">
                <input
                    type="checkbox"
                    checked={enableEncryption}
                    onChange={(event) => setEnableEncryption(event.target.checked)}
                    disabled={saving || currentlyEncrypted || !canEnableEncryption}
                />
                {currentlyEncrypted ? "Encryption enabled (cannot be disabled)." : "Enable end-to-end encryption"}
            </label>

            {!canEditName || !canEditTopic || !canEditJoinRule || !canEditHistoryVisibility ? (
                <p className="room-dialog-warning">Some fields are read-only because of your room permissions.</p>
            ) : null}
            {error ? <p className="room-dialog-error">{error}</p> : null}
        </RoomDialog>
    );
}
