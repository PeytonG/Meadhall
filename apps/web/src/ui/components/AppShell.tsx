import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ClientEvent,
    EventType,
    JoinRule,
    MatrixEventEvent,
    RoomEvent,
    RoomStateEvent,
    type HierarchyRoom,
    type MatrixClient,
    type MatrixEvent,
    type Room,
} from "matrix-js-sdk/src/matrix";

import { getBrandName } from "../../core/config/branding";
import meadhallIcon from "../assets/meadhall-icon.png";
import { createOrReuseDirectChat, ensureDirectRoomMapping, getDirectRoomIds } from "../adapters/dmAdapter";
import { describeJoinError, joinRoomWithRetry } from "../adapters/joinAdapter";
import { mediaFromMxc, thumbnailFromMxc } from "../adapters/media";
import { Composer } from "./Composer";
import { EmojiUploadDialog } from "./EmojiUploadDialog";
import { ChannelHeader } from "./header/ChannelHeader";
import { RightPanel } from "./rightPanel/RightPanel";
import { RoomList, getServerUnreadCount, hasUnreadActivity, type DiscoverableSpaceChannel } from "./RoomList";
import { ContextMenu } from "./menus/ContextMenu";
import { InboxPanel } from "./inbox/InboxPanel";
import { ThreadPanel } from "../threads/ThreadPanel";
import { getSpaceBanner } from "../../core/rooms/spaceBanner";
import { isVoiceChatEnabled } from "../../core/voice/voiceChat";
import { useDesktopUpdates } from "../hooks/useDesktopUpdates";
import { useMobileUpdates } from "../hooks/useMobileUpdates";
import { channelMenuItems, spaceMenuItems } from "./menus/roomMenus";
import { ServerProfileDialog } from "./rooms/ServerProfileDialog";
import {
    RoomNotificationMode,
    applySpaceNotificationMode,
    getSpaceNotificationMode,
    isRoomMuted,
    markRoomsRead,
    setSpaceNotificationMode,
} from "../notifications/roomActions";
import { getRoomNotificationMode, setRoomNotificationMode } from "../adapters/roomNotificationAdapter";
import { getSpaceView, movedSpaceOrder, orderSpaces, readSpaceOrder, saveSpaceOrder, setSpaceView, useSpaceView } from "../stores/spaceView";
import { Timeline } from "./Timeline";
import { Toast, type ToastState } from "./Toast";
import { Avatar } from "./Avatar";
import { HomeSidebar, isOneToOneRoom } from "./HomeSidebar";
import { CreateRoomDialog } from "./rooms/CreateRoomDialog";
import { CreateSpaceDialog } from "./rooms/CreateSpaceDialog";
import { ImportJsonWizard } from "./rooms/ImportJsonWizard";
import { CreateDirectChatDialog } from "./rooms/CreateDirectChatDialog";
import { InviteDialog } from "./rooms/InviteDialog";
import { JoinRoomDialog } from "./rooms/JoinRoomDialog";
import { RoomModerationDialog } from "./rooms/RoomModerationDialog";
import { RoomSettingsDialog } from "./rooms/RoomSettingsDialog";
import { SettingsOverlay, type SettingsMode } from "../settings/SettingsOverlay";
import {
    applyAppearanceTheme,
    loadUserLocalSettings,
    withNotificationsOnOnce,
    saveUserLocalSettings,
    type UserLocalSettings,
} from "../settings/user/settingsStore";
import {
    getFeatureRenderReactionImages,
    setFeatureRenderReactionImages,
} from "../emoji/EmojiPackStore";
import type { EmojiPackTarget } from "../emoji/EmojiPackTypes";
import { useSelectedUser } from "../hooks/useSelectedUser";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useElementLikeNotifications } from "../notifications/useElementLikeNotifications";
import { useMatrix } from "../providers/MatrixProvider";
import { buildMatrixToRoomPermalink } from "../utils/permalink";
import type { RightSidebarMode } from "./rightPanel/types";
import { VoiceRoom, type VoiceControlState, type VoiceRoomHandle, type VoiceSessionStatus } from "./voice/VoiceRoom";
import { DesktopUpdateBanner } from "./DesktopUpdateBanner";
import { MobileUpdateBanner } from "./MobileUpdateBanner";
import { WhatsNewDialog } from "./WhatsNewDialog";
import { addAccount, setInCallForSwitching, switchAccount, takePendingRoom, useStoredAccounts } from "../accounts/accountSwitching";
import { useOtherAccountNotifications } from "../accounts/useOtherAccountNotifications";
import { useTaskbarBadge } from "../notifications/taskbarBadge";
import { captureGlobalErrors, logAppError } from "../logs/appLog";
import { CallEndedNotice } from "./voice/CallEndedNotice";
import { RailSpaceIcon } from "./RailSpaceIcon";
import { callAnnouncement } from "../voice/callAnnouncement";
import { cleanUpBugReportRooms, isBugReportRoom, isReceivedBugReport, isSentBugReport } from "../../core/bugReport/bugReport";
import { syncDesktopTitleBarColors } from "../desktop/titleBarColors";
import { onAccessTokenRefreshed } from "../../core/auth/accessTokenEvents";
import { startAndroidBackgroundSync, stopAndroidBackgroundSync, updateAndroidBackgroundSyncToken } from "../platform/androidBackgroundSync";
import { PixelIcon } from "./PixelIcon";
import {
    MATRIX_CALL_COMPAT_EVENT,
    HEOROT_VOICE_CHANNEL_EVENT,
    isVoiceChannelHintContent,
    isVoiceChannelRoom,
} from "../voice/voiceChannel";
import { clearVoiceDiscovery, initVoiceDiscovery } from "../voice/voiceDiscovery";
import { useRoomCalls } from "../hooks/useRoomCalls";
import { useIncomingCall } from "../hooks/useIncomingCall";
import { applyOwnStatus, currentPlatform, loadOwnStatus, type OwnStatus, type PublishedActivity } from "../presence/clientStatus";
import { listenForPrivateActivity, pickActivity, resendIntervalMs, setDetectedActivities, shareActivityWithDms } from "../presence/activitySharing";
import { startAwayTracker } from "../presence/autoAway";
import { StatusMenu } from "./StatusMenu";
import { IncomingCallCard } from "./voice/IncomingCallCard";
import {
    loadSelfVoiceState,
    saveSelfVoiceState,
    toggleSelfDeafen,
    toggleSelfMute,
    type SelfVoiceState,
} from "../voice/selfVoiceState";
import { CHANNEL_ORDER_STATE_EVENT, readChannelOrder, writeChannelOrder } from "../stores/CategoryStore";
import { loadBadgeList } from "../../core/badges/badges";
import { setSoundStyle } from "../notifications/soundStyle";
import { MotionImage } from "./MotionImage";
import { closeExpiredPolls } from "../polls/pollActions";

interface AppShellProps {
    client: MatrixClient;
    onLogout: () => Promise<void>;
}

interface SpaceChildOrder {
    index: number;
    order?: string;
    viaServers: string[];
    isVoiceChannel: boolean;
}

interface SpaceChildStateSnapshotEvent {
    type?: unknown;
    state_key?: unknown;
    content?: unknown;
}

interface SettingsState {
    mode: SettingsMode;
    tab: string;
}

const PEOPLE_SPACE_ID = "people-space";
const RIGHT_SIDEBAR_MODE_STORAGE_KEY = "heorot.ui.rightSidebarMode";
const CHANNELS_PANE_WIDTH_KEY = "heorot.ui.channelsPaneWidth";
const CHANNELS_PANE_MIN = 180;
const CHANNELS_PANE_MAX = 480;
const CHANNELS_PANE_DEFAULT = 280;
const DEFAULT_VOICE_CONTROL_STATE: VoiceControlState = {
    joining: false,
    connected: false,
    micMuted: true,
    audioMuted: false,
};

function readChannelsPaneWidth(): number {
    try {
        const raw = window.localStorage.getItem(CHANNELS_PANE_WIDTH_KEY);
        if (raw) {
            const n = Number(raw);
            if (Number.isFinite(n)) return Math.min(CHANNELS_PANE_MAX, Math.max(CHANNELS_PANE_MIN, n));
        }
    } catch { /* ignore */ }
    return CHANNELS_PANE_DEFAULT;
}

function readStoredRightSidebarMode(): RightSidebarMode {
    if (typeof window === "undefined") {
        return "members";
    }

    const raw = window.localStorage.getItem(RIGHT_SIDEBAR_MODE_STORAGE_KEY);
    if (raw === "members" || raw === "search" || raw === "pins" || raw === "info" || raw === "closed") {
        return raw;
    }

    return "members";
}

function getRoomName(room: Room): string {
    return room.name || room.getCanonicalAlias() || room.roomId;
}

// Every room except the hidden bug-report rooms (Settings → Report a bug).
function listedRooms(client: MatrixClient): Room[] {
    return client.getRooms().filter((room) => !isSentBugReport(room, client.getUserId()));
}

function isVisibleMembership(room: Room): boolean {
    const membership = room.getMyMembership();
    return membership === "join" || membership === "invite" || membership === "knock";
}

function compareRoomsByName(left: Room, right: Room): number {
    const nameComparison = getRoomName(left).localeCompare(getRoomName(right), undefined, {
        sensitivity: "base",
    });
    if (nameComparison !== 0) {
        return nameComparison;
    }

    return left.roomId.localeCompare(right.roomId);
}

function sortRoomsByName(rooms: Room[]): Room[] {
    return [...rooms].sort(compareRoomsByName);
}

function getRoomLastTimestamp(room: Room): number {
    const liveEvents = room.getLiveTimeline()?.getEvents() ?? room.timeline;
    const lastEvent = liveEvents[liveEvents.length - 1];
    if (lastEvent) {
        return lastEvent.getTs();
    }

    const roomAsExtended = room as Room & {
        getLastActiveTimestamp?: () => number;
    };
    return roomAsExtended.getLastActiveTimestamp?.() ?? 0;
}

function sortRoomsByActivity(rooms: Room[]): Room[] {
    return [...rooms].sort((left, right) => {
        const delta = getRoomLastTimestamp(right) - getRoomLastTimestamp(left);
        if (delta !== 0) {
            return delta;
        }

        return compareRoomsByName(left, right);
    });
}

function areStringSetsEqual(left: Set<string> | undefined, right: Set<string>): boolean {
    if (!left) {
        return right.size === 0;
    }
    if (left.size !== right.size) {
        return false;
    }
    for (const value of left) {
        if (!right.has(value)) {
            return false;
        }
    }
    return true;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}

interface SpaceParentCandidate {
    spaceId: string;
    viaServers: string[];
    canonical: boolean;
}

function toStateEventsArray(
    rawEvents: unknown,
): Array<{ getStateKey: () => string | undefined | null; getContent: () => Record<string, unknown> }> {
    if (Array.isArray(rawEvents)) {
        return rawEvents as Array<{ getStateKey: () => string | undefined | null; getContent: () => Record<string, unknown> }>;
    }
    if (rawEvents) {
        return [rawEvents as { getStateKey: () => string | undefined | null; getContent: () => Record<string, unknown> }];
    }
    return [];
}

function normalizeViaServers(rawVia: unknown): string[] {
    if (!Array.isArray(rawVia)) {
        return [];
    }

    return [
        ...new Set(
            rawVia
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
        ),
    ];
}

function readSpaceParentCandidates(room: Room): SpaceParentCandidate[] {
    const parentEvents = toStateEventsArray(room.currentState.getStateEvents(EventType.SpaceParent));
    const bySpaceId = new Map<string, SpaceParentCandidate>();

    for (const parentEvent of parentEvents) {
        const parentSpaceId = parentEvent.getStateKey();
        if (typeof parentSpaceId !== "string" || parentSpaceId.length === 0) {
            continue;
        }

        const content = (parentEvent.getContent() ?? {}) as { via?: unknown; canonical?: unknown };
        const nextViaServers = normalizeViaServers(content.via);
        const existing = bySpaceId.get(parentSpaceId);

        if (!existing) {
            bySpaceId.set(parentSpaceId, {
                spaceId: parentSpaceId,
                viaServers: nextViaServers,
                canonical: content.canonical === true,
            });
            continue;
        }

        const mergedViaServers = new Set([...existing.viaServers, ...nextViaServers]);
        bySpaceId.set(parentSpaceId, {
            spaceId: parentSpaceId,
            viaServers: Array.from(mergedViaServers),
            canonical: existing.canonical || content.canonical === true,
        });
    }

    return Array.from(bySpaceId.values()).sort((left, right) => {
        if (left.canonical !== right.canonical) {
            return left.canonical ? -1 : 1;
        }
        return left.spaceId.localeCompare(right.spaceId);
    });
}

function getViaServersForParentSpace(client: MatrixClient, parentSpaceId: string): string[] {
    const viaServers = new Set<string>();
    const visibleRooms = client.getRooms().filter((room) => !room.isSpaceRoom() && isVisibleMembership(room));

    for (const room of visibleRooms) {
        const candidates = readSpaceParentCandidates(room);
        for (const candidate of candidates) {
            if (candidate.spaceId !== parentSpaceId) {
                continue;
            }
            for (const viaServer of candidate.viaServers) {
                viaServers.add(viaServer);
            }
        }
    }

    return Array.from(viaServers);
}

async function ensureRoomParentSpacesJoined(
    client: MatrixClient,
    room: Room,
    preferredSpaceId: string | null | undefined,
): Promise<string | null> {
    const candidates = readSpaceParentCandidates(room);
    if (candidates.length === 0 && !preferredSpaceId) {
        return null;
    }

    const bySpaceId = new Map(candidates.map((candidate) => [candidate.spaceId, candidate] as const));
    if (preferredSpaceId && !bySpaceId.has(preferredSpaceId)) {
        bySpaceId.set(preferredSpaceId, {
            spaceId: preferredSpaceId,
            viaServers: getViaServersForParentSpace(client, preferredSpaceId),
            canonical: true,
        });
    }

    const orderedCandidates = [
        ...(preferredSpaceId ? [bySpaceId.get(preferredSpaceId)].filter((value): value is SpaceParentCandidate => Boolean(value)) : []),
        ...Array.from(bySpaceId.values()).filter((candidate) => candidate.spaceId !== preferredSpaceId),
    ];

    for (const candidate of orderedCandidates) {
        const existingParent = client.getRoom(candidate.spaceId);
        if (existingParent?.isSpaceRoom() && existingParent.getMyMembership() === "join") {
            return candidate.spaceId;
        }

        try {
            const joinedParent = await joinRoomWithRetry(client, candidate.spaceId, {
                viaServers: candidate.viaServers,
                maxAttempts: 1,
            });
            if (joinedParent.isSpaceRoom() && joinedParent.getMyMembership() === "join") {
                return joinedParent.roomId;
            }
        } catch {
            // Best-effort: some users can join channel without permission to join parent space.
        }
    }

    return null;
}
function updateRoomIdentitySetMap(
    current: Map<string, Set<string>>,
    roomId: string,
    nextValues: Set<string>,
): Map<string, Set<string>> {
    const currentValues = current.get(roomId);
    if (nextValues.size === 0) {
        if (!currentValues) {
            return current;
        }
        const next = new Map(current);
        next.delete(roomId);
        return next;
    }
    if (areStringSetsEqual(currentValues, nextValues)) {
        return current;
    }
    const next = new Map(current);
    next.set(roomId, nextValues);
    return next;
}

function readSpaceChildOrderFromStateSnapshot(stateEvents: SpaceChildStateSnapshotEvent[]): Map<string, SpaceChildOrder> {
    const orderByRoomId = new Map<string, SpaceChildOrder>();
    let childIndex = 0;

    stateEvents.forEach((event) => {
        if (event.type !== EventType.SpaceChild) {
            return;
        }

        const childRoomId = typeof event.state_key === "string" ? event.state_key : "";
        if (!childRoomId || orderByRoomId.has(childRoomId)) {
            return;
        }

        const content = (event.content ?? {}) as { order?: unknown; via?: unknown; [key: string]: unknown };
        const order =
            typeof content.order === "string" && content.order.length > 0 && content.order.length <= 50
                ? content.order
                : undefined;
        const viaServers = Array.isArray(content.via)
            ? content.via
                  .filter((value): value is string => typeof value === "string")
                  .map((value) => value.trim())
                  .filter((value) => value.length > 0)
            : [];
        const isVoiceChannel = isVoiceChannelHintContent(content);

        orderByRoomId.set(childRoomId, { index: childIndex, order, viaServers, isVoiceChannel });
        childIndex += 1;
    });

    return orderByRoomId;
}
function readChannelOrderFromStateSnapshot(stateEvents: SpaceChildStateSnapshotEvent[]): string[] {
    for (const event of stateEvents) {
        if (event.type !== CHANNEL_ORDER_STATE_EVENT) {
            continue;
        }

        const stateKey = typeof event.state_key === "string" ? event.state_key : "";
        if (stateKey !== "") {
            continue;
        }

        if (!event.content || typeof event.content !== "object" || Array.isArray(event.content)) {
            return [];
        }

        const content = event.content as { order?: unknown };
        if (!Array.isArray(content.order)) {
            return [];
        }

        return content.order.filter((value): value is string => typeof value === "string" && value.length > 0);
    }

    return [];
}
function isVoiceChannelFromStateSnapshot(stateEvents: SpaceChildStateSnapshotEvent[]): boolean {
    for (const event of stateEvents) {
        const eventType = typeof event.type === "string" ? event.type : "";
        const content = event.content;

        if (eventType === HEOROT_VOICE_CHANNEL_EVENT) {
            if (
                content &&
                typeof content === "object" &&
                !Array.isArray(content) &&
                (content as { enabled?: unknown }).enabled === true
            ) {
                return true;
            }
            continue;
        }

        if (eventType !== MATRIX_CALL_COMPAT_EVENT || !content || typeof content !== "object" || Array.isArray(content)) {
            continue;
        }

        const callContent = content as { intent?: unknown; type?: unknown };
        const intent = typeof callContent.intent === "string" ? callContent.intent.trim().toLowerCase() : "";
        const callType = typeof callContent.type === "string" ? callContent.type.trim().toLowerCase() : "";
        if (intent === "voice" || callType === "voice") {
            return true;
        }
    }

    return false;
}

function readSpaceChildOrder(spaceRoom: Room): Map<string, SpaceChildOrder> {
    const rawEvents = spaceRoom.currentState.getStateEvents(EventType.SpaceChild);
    const events = Array.isArray(rawEvents) ? rawEvents : rawEvents ? [rawEvents] : [];
    const snapshotEvents = events.map((event) => ({
        type: EventType.SpaceChild,
        state_key: event.getStateKey(),
        content: event.getContent(),
    }));

    return readSpaceChildOrderFromStateSnapshot(snapshotEvents);
}

function buildCustomChannelOrderIndex(spaceRoom: Room, orderOverride?: string[]): Map<string, number> {
    const byRoomId = new Map<string, number>();
    const order = Array.isArray(orderOverride) ? orderOverride : readChannelOrder(spaceRoom);

    order.forEach((roomId, index) => {
        if (!byRoomId.has(roomId)) {
            byRoomId.set(roomId, index);
        }
    });

    return byRoomId;
}

function getSpaceChannels(spaceRoom: Room, roomById: Map<string, Room>): Room[] {
    const childOrder = readSpaceChildOrder(spaceRoom);
    const customOrderByRoomId = buildCustomChannelOrderIndex(spaceRoom);
    const channels: Array<{ room: Room; index: number; order?: string; customOrderIndex?: number }> = [];

    for (const [roomId, metadata] of childOrder.entries()) {
        const room = roomById.get(roomId);
        if (!room || room.isSpaceRoom() || !isVisibleMembership(room)) {
            continue;
        }

        channels.push({
            room,
            index: metadata.index,
            order: metadata.order,
            customOrderIndex: customOrderByRoomId.get(roomId),
        });
    }

    channels.sort((left, right) => {
        const leftCustom = left.customOrderIndex;
        const rightCustom = right.customOrderIndex;
        if (leftCustom !== undefined && rightCustom !== undefined && leftCustom !== rightCustom) {
            return leftCustom - rightCustom;
        }
        if (leftCustom !== undefined) {
            return -1;
        }
        if (rightCustom !== undefined) {
            return 1;
        }

        if (left.order && right.order) {
            const byOrder = left.order.localeCompare(right.order);
            if (byOrder !== 0) {
                return byOrder;
            }
        } else if (left.order) {
            return -1;
        } else if (right.order) {
            return 1;
        }

        if (left.index !== right.index) {
            return left.index - right.index;
        }

        const byName = compareRoomsByName(left.room, right.room);
        if (byName !== 0) {
            return byName;
        }

        return left.room.roomId.localeCompare(right.room.roomId);
    });

    return channels.map((entry) => entry.room);
}

function getSpaceGlyph(spaceName: string): string {
    const normalized = spaceName.trim().replace(/^[@#+!]+/, "");
    if (!normalized) {
        return "#";
    }

    return normalized[0].toUpperCase();
}

async function getSpaceHierarchyRooms(client: MatrixClient, spaceRoomId: string): Promise<HierarchyRoom[]> {
    const roomById = new Map<string, HierarchyRoom>();
    const visitedTokens = new Set<string>();
    let fromToken: string | undefined;

    while (true) {
        const response = await client.getRoomHierarchy(spaceRoomId, 100, 1, false, fromToken);
        response.rooms.forEach((room) => {
            if (!roomById.has(room.room_id)) {
                roomById.set(room.room_id, room);
            }
        });

        const nextToken = response.next_batch;
        if (!nextToken || visitedTokens.has(nextToken)) {
            break;
        }
        visitedTokens.add(nextToken);
        fromToken = nextToken;
    }

    return Array.from(roomById.values());
}

function getHierarchyRoomName(room: HierarchyRoom): string {
    return room.name || room.canonical_alias || room.aliases?.[0] || room.room_id;
}

interface OrderedHierarchyChannelEntry {
    roomId: string;
    name: string;
    index: number;
    order?: string;
    customOrderIndex?: number;
}

function compareOrderedHierarchyChannelEntries(
    left: OrderedHierarchyChannelEntry,
    right: OrderedHierarchyChannelEntry,
): number {
    const leftCustom = left.customOrderIndex;
    const rightCustom = right.customOrderIndex;
    if (leftCustom !== undefined && rightCustom !== undefined && leftCustom !== rightCustom) {
        return leftCustom - rightCustom;
    }
    if (leftCustom !== undefined) {
        return -1;
    }
    if (rightCustom !== undefined) {
        return 1;
    }

    if (left.order && right.order) {
        const byOrder = left.order.localeCompare(right.order);
        if (byOrder !== 0) {
            return byOrder;
        }
    } else if (left.order) {
        return -1;
    } else if (right.order) {
        return 1;
    }

    if (left.index !== right.index) {
        return left.index - right.index;
    }

    const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    if (byName !== 0) {
        return byName;
    }

    return left.roomId.localeCompare(right.roomId);
}

function sortRoomsBySpaceOrder(spaceRoom: Room, rooms: Room[]): Room[] {
    const childOrder = readSpaceChildOrder(spaceRoom);
    const customOrderByRoomId = buildCustomChannelOrderIndex(spaceRoom);
    const entries: Array<OrderedHierarchyChannelEntry & { room: Room }> = rooms.map((room, listIndex) => {
        const metadata = childOrder.get(room.roomId);
        return {
            room,
            roomId: room.roomId,
            name: getRoomName(room),
            index: metadata?.index ?? listIndex,
            order: metadata?.order,
            customOrderIndex: customOrderByRoomId.get(room.roomId),
        };
    });

    entries.sort(compareOrderedHierarchyChannelEntries);
    return entries.map((entry) => entry.room);
}

function buildJoinedHierarchyChannelIds(
    spaceRoom: Room,
    hierarchyRooms: HierarchyRoom[],
    visibleRoomIds: Set<string>,
    childOrderOverride?: Map<string, SpaceChildOrder>,
    customOrderOverride?: string[],
): string[] {
    const childOrder = childOrderOverride ?? readSpaceChildOrder(spaceRoom);
    const customOrderByRoomId = buildCustomChannelOrderIndex(spaceRoom, customOrderOverride);
    const entries: OrderedHierarchyChannelEntry[] = [];
    let hierarchyIndex = 0;

    for (const room of hierarchyRooms) {
        if (room.room_id === spaceRoom.roomId) {
            continue;
        }
        if (room.room_type === "m.space") {
            continue;
        }
        if (!visibleRoomIds.has(room.room_id)) {
            continue;
        }

        const metadata = childOrder.get(room.room_id);
        entries.push({
            roomId: room.room_id,
            name: getHierarchyRoomName(room),
            index: metadata?.index ?? hierarchyIndex,
            order: metadata?.order,
            customOrderIndex: customOrderByRoomId.get(room.room_id),
        });
        hierarchyIndex += 1;
    }

    entries.sort(compareOrderedHierarchyChannelEntries);
    return entries.map((entry) => entry.roomId);
}

function buildDiscoverableSpaceChannels(
    spaceRoom: Room,
    hierarchyRooms: HierarchyRoom[],
    visibleRoomIds: Set<string>,
    childOrderOverride?: Map<string, SpaceChildOrder>,
    customOrderOverride?: string[],
    voiceChannelHintRoomIds?: Set<string>,
): DiscoverableSpaceChannel[] {
    const childOrder = childOrderOverride ?? readSpaceChildOrder(spaceRoom);
    const customOrderByRoomId = buildCustomChannelOrderIndex(spaceRoom, customOrderOverride);
    const channels: Array<DiscoverableSpaceChannel & { index: number; order?: string; customOrderIndex?: number }> = [];
    let hierarchyIndex = 0;

    for (const room of hierarchyRooms) {
        if (room.room_id === spaceRoom.roomId) {
            continue;
        }
        if (room.room_type === "m.space") {
            continue;
        }
        if (room.join_rule !== JoinRule.Public) {
            continue;
        }
        if (visibleRoomIds.has(room.room_id)) {
            continue;
        }

        const metadata = childOrder.get(room.room_id);
        channels.push({
            roomId: room.room_id,
            name: getHierarchyRoomName(room),
            topic: room.topic,
            avatarMxc: room.avatar_url ?? null,
            memberCount: room.num_joined_members,
            isVoiceChannel: metadata?.isVoiceChannel === true || voiceChannelHintRoomIds?.has(room.room_id) === true,
            viaServers: metadata?.viaServers ?? [],
            index: metadata?.index ?? hierarchyIndex,
            order: metadata?.order,
            customOrderIndex: customOrderByRoomId.get(room.room_id),
        });
        hierarchyIndex += 1;
    }

    channels.sort(compareOrderedHierarchyChannelEntries);

    return channels.map(({ index: _index, order: _order, customOrderIndex: _customOrderIndex, ...channel }) => channel);
}

async function resolveSpaceHierarchyVoiceHints(
    client: MatrixClient,
    spaceRoom: Room,
    hierarchyRooms: HierarchyRoom[],
): Promise<{
    childOrderOverride?: Map<string, SpaceChildOrder>;
    customOrderOverride?: string[];
    voiceHintRoomIds: Set<string>;
}> {
    let childOrderOverride: Map<string, SpaceChildOrder> | undefined;
    let customOrderOverride: string[] | undefined;
    const voiceHintRoomIds = new Set<string>();
    const hierarchyChannelRoomIds = hierarchyRooms
        .filter((room) => room.room_id !== spaceRoom.roomId)
        .filter((room) => room.room_type !== "m.space")
        .map((room) => room.room_id);

    try {
        const remoteStateEvents = await client.roomState(spaceRoom.roomId);
        childOrderOverride = readSpaceChildOrderFromStateSnapshot(remoteStateEvents as SpaceChildStateSnapshotEvent[]);
        const remoteChannelOrder = readChannelOrderFromStateSnapshot(remoteStateEvents as SpaceChildStateSnapshotEvent[]);
        if (remoteChannelOrder.length > 0) {
            customOrderOverride = remoteChannelOrder;
        }
        for (const [roomId, metadata] of childOrderOverride.entries()) {
            if (metadata.isVoiceChannel) {
                voiceHintRoomIds.add(roomId);
            }
        }
    } catch {
        childOrderOverride = undefined;
        customOrderOverride = undefined;
    }

    for (const roomId of hierarchyChannelRoomIds) {
        const room = client.getRoom(roomId);
        if (isVoiceChannelRoom(room)) {
            voiceHintRoomIds.add(roomId);
        }
    }

    const unresolvedVoiceCandidates = hierarchyChannelRoomIds.filter((roomId) => !voiceHintRoomIds.has(roomId));
    await Promise.all(
        unresolvedVoiceCandidates.map(async (roomId) => {
            try {
                const roomState = await client.roomState(roomId);
                if (isVoiceChannelFromStateSnapshot(roomState as SpaceChildStateSnapshotEvent[])) {
                    voiceHintRoomIds.add(roomId);
                }
            } catch {
                // Room state can be inaccessible for non-members/invites; keep best-effort hints.
            }
        }),
    );

    return { childOrderOverride, customOrderOverride, voiceHintRoomIds };
}

function findParentSpaceIdForRoom(roomId: string, spaces: Room[]): string | null {
    for (const space of spaces) {
        const children = readSpaceChildOrder(space);
        if (children.has(roomId)) {
            return space.roomId;
        }
    }

    return null;
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

export function AppShell({ client, onLogout }: AppShellProps): React.ReactElement {
    const { config } = useMatrix();
    const brandName = getBrandName(config);
    const [voiceDiscoveryReady, setVoiceDiscoveryReady] = useState(false);
    const [rooms, setRooms] = useState<Room[]>(() => listedRooms(client));
    const [selectedSpaceId, setSelectedSpaceId] = useState<string>(PEOPLE_SPACE_ID);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(() => {
        const directRoomIds = getDirectRoomIds(client);
        const firstRoom = sortRoomsByActivity(
            client
                .getRooms()
                .filter((room) => !room.isSpaceRoom())
                .filter((room) => directRoomIds.has(room.roomId))
                .filter(isVisibleMembership),
        )[0];
        return firstRoom?.roomId ?? null;
    });
    const [replyToEvent, setReplyToEvent] = useState<MatrixEvent | null>(null);
    const [editingEvent, setEditingEvent] = useState<MatrixEvent | null>(null);
    // The thread open beside the chat; it stays with its room (switching away and back keeps it open).
    const [openThread, setOpenThread] = useState<{ roomId: string; rootEventId: string } | null>(null);
    const closeThread = useCallback(() => setOpenThread(null), []);
    const [renderReactionImages, setRenderReactionImages] = useState<boolean>(() => getFeatureRenderReactionImages());
    const [emojiUploadOpen, setEmojiUploadOpen] = useState(false);
    const [emojiUploadTarget, setEmojiUploadTarget] = useState<EmojiPackTarget | null>(null);
    const [createDirectChatOpen, setCreateDirectChatOpen] = useState(false);
    const [createRoomOpen, setCreateRoomOpen] = useState(false);
    const [createRoomParentSpaceId, setCreateRoomParentSpaceId] = useState<string | null>(null);
    const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
    const [importJsonOpen, setImportJsonOpen] = useState(false);
    const [spaceOnboardingSpaceId, setSpaceOnboardingSpaceId] = useState<string | null>(null);
    const [joinRoomOpen, setJoinRoomOpen] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteTargetRoomId, setInviteTargetRoomId] = useState<string | null>(null);
    const [roomSettingsRoomId, setRoomSettingsRoomId] = useState<string | null>(null);
    const [roomModerationOpen, setRoomModerationOpen] = useState(false);
    const [rightSidebarMode, setRightSidebarMode] = useState<RightSidebarMode>(() => readStoredRightSidebarMode());
    const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
    const [selectedSpaceHierarchyJoinedRoomIds, setSelectedSpaceHierarchyJoinedRoomIds] = useState<string[]>([]);
    const [discoverableSpaceChannels, setDiscoverableSpaceChannels] = useState<DiscoverableSpaceChannel[]>([]);
    const [refreshedVoiceChannelHintsBySpaceId, setRefreshedVoiceChannelHintsBySpaceId] = useState<
        Map<string, Set<string>>
    >(new Map());
    const [joiningDiscoverableRoomId, setJoiningDiscoverableRoomId] = useState<string | null>(null);
    const [settingsState, setSettingsState] = useState<SettingsState | null>(null);
    const [pendingFocusRoomId, setPendingFocusRoomId] = useState<string | null>(null);
    const [userSettings, setUserSettings] = useState<UserLocalSettings>(() => withNotificationsOnOnce(loadUserLocalSettings()));
    const [toast, setToast] = useState<ToastState | null>(null);
    const [voiceSessionRoomId, setVoiceSessionRoomId] = useState<string | null>(null);
    const [voiceSessionStatus, setVoiceSessionStatus] = useState<VoiceSessionStatus>("disconnected");
    const [voiceAutoJoinNonce, setVoiceAutoJoinNonce] = useState(0);
    const [voiceControlState, setVoiceControlState] = useState<VoiceControlState>(DEFAULT_VOICE_CONTROL_STATE);
    const voiceControlStateRef = useRef<VoiceControlState>(DEFAULT_VOICE_CONTROL_STATE);
    const pendingVoiceControlTargetRef = useRef<{ micMuted: boolean; audioMuted: boolean } | null>(null);
    const [selfVoice, setSelfVoice] = useState<SelfVoiceState>(() => loadSelfVoiceState());
    // Your status (user panel menu): presence, custom text, DND. Applied on start and whenever it changes.
    const [ownStatus, setOwnStatus] = useState<OwnStatus>(() => loadOwnStatus());
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const updateOwnStatus = useCallback((next: OwnStatus) => setOwnStatus(next), []);
    const [autoAway, setAutoAway] = useState(false);
    useEffect(() => {
        if (ownStatus.state !== "auto") {
            setAutoAway(false);
            return undefined;
        }
        const desktopIdle = window.heorotDesktop?.getSystemIdleSeconds;
        return startAwayTracker(setAutoAway, {
            systemIdleMs: desktopIdle ? async () => (await desktopIdle()) * 1000 : undefined,
        });
    }, [ownStatus.state]);
    // Desktop: what you're doing ("Playing ...", "Listening to ..."), from the sources you turned on, minus what you
    // hid, shared with the audience you chose (Settings → Privacy → Activity).
    const [activity, setActivity] = useState<PublishedActivity | null>(null);
    const shareActivity = userSettings.privacy.shareActivity;
    const activitySettings = userSettings.privacy.activity;
    const activitySettingsKey = JSON.stringify(activitySettings);
    useEffect(() => {
        const desktop = window.heorotDesktop;
        if (!desktop?.getActivities || !shareActivity) {
            setActivity(null);
            setDetectedActivities([]);
            void desktop?.setRichPresence?.(false).catch(() => undefined);
            return undefined;
        }
        const settings = activitySettings;
        void desktop.setRichPresence?.(settings.richPresence).catch(() => undefined);
        const options = { steam: settings.steam, richPresence: settings.richPresence, games: settings.games, media: settings.media };
        let cancelled = false;
        const poll = (): void => {
            void desktop.getActivities!(options)
                .catch(() => [])
                .then((found) => {
                    if (cancelled) return;
                    setDetectedActivities(found);
                    setActivity((current) => {
                        const next = pickActivity(found, settings, current);
                        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
                    });
                });
        };
        poll();
        // Rich Presence apps change often (song, level); Steam and process scans are cached on the desktop side.
        const timer = window.setInterval(poll, settings.richPresence || settings.media ? 15_000 : 30_000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shareActivity, activitySettingsKey]);
    const shareStatus = userSettings.privacy.shareStatus;
    const activityAudience = activitySettings.audience;
    useEffect(() => {
        void applyOwnStatus(client, ownStatus, autoAway, activityAudience === "nobody" ? null : activity, shareStatus, activityAudience);
    }, [client, ownStatus, autoAway, activity, shareStatus, activityAudience]);
    // "Only people I have DMs with": sent to them encrypted (and cleared when it stops), re-sent while it lasts.
    useEffect(() => {
        const shared = activityAudience === "dms" && shareStatus && ownStatus.state !== "invisible" ? activity : null;
        void shareActivityWithDms(client, shared).catch(() => undefined);
        if (!shared) return undefined;
        const timer = window.setInterval(() => void shareActivityWithDms(client, shared, true).catch(() => undefined), resendIntervalMs());
        return () => window.clearInterval(timer);
    }, [client, activity, activityAudience, shareStatus, ownStatus.state]);
    useEffect(() => listenForPrivateActivity(client), [client]);
    // Switching accounts reloads the app (ending a call), so it asks first during one.
    useEffect(() => setInCallForSwitching(voiceSessionStatus !== "disconnected"), [voiceSessionStatus]);
    const ownStatusDot =
        ownStatus.state === "idle" || (ownStatus.state === "auto" && autoAway) ? "idle" : ownStatus.state === "dnd" ? "dnd" : ownStatus.state === "invisible" ? "offline" : currentPlatform() === "mobile" && ownStatus.state === "auto" ? "mobile" : "online";
    useEffect(() => {
        saveSelfVoiceState(selfVoice);
    }, [selfVoice]);
    const [voiceSpeakingByRoomId, setVoiceSpeakingByRoomId] = useState<Map<string, Set<string>>>(new Map());
    const [voiceScreenShareByRoomId, setVoiceScreenShareByRoomId] = useState<Map<string, Set<string>>>(new Map());
    const [voiceParticipantsByRoomId, setVoiceParticipantsByRoomId] = useState<Map<string, Set<string>>>(new Map());
    const [timelineFocusBottomNonce, setTimelineFocusBottomNonce] = useState(0);
    const voiceRoomRef = useRef<VoiceRoomHandle | null>(null);
    const autoJoiningDirectRoomIdsRef = useRef<Set<string>>(new Set());
    // Phones show one screen at a time, like the Discord app: the server rail + channel list, or the open chat.
    const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
    const openRoomAtBottom = useCallback((roomId: string): void => {
        setActiveRoomId(roomId);
        setTimelineFocusBottomNonce((value) => value + 1);
    }, []);
    const selectHome = useCallback((): void => {
        setSelectedSpaceId(PEOPLE_SPACE_ID);
        setMobilePane("list");
    }, []);
    const selectServer = useCallback((spaceId: string): void => {
        setSelectedSpaceId(spaceId);
        setMobilePane("list");
    }, []);

    const handleLiveParticipantsChange = useCallback(
        ({
            roomId,
            participants,
        }: {
            roomId: string;
            participants: Array<{ identity: string; userId?: string; isSpeaking: boolean; isScreenSharing: boolean }>;
        }): void => {
            const normalizeParticipantId = (participant: { identity: string; userId?: string }): string =>
                participant.userId ?? participant.identity;

            const participantUserIds = new Set(participants.map((participant) => normalizeParticipantId(participant)));
            const speakingUserIds = new Set(
                participants
                    .filter((participant) => participant.isSpeaking)
                    .map((participant) => normalizeParticipantId(participant)),
            );
            const sharingUserIds = new Set(
                participants
                    .filter((participant) => participant.isScreenSharing)
                    .map((participant) => normalizeParticipantId(participant)),
            );

            setVoiceParticipantsByRoomId((current) => {
                const next = new Map(current);
                next.set(roomId, participantUserIds);
                return next;
            });
            setVoiceSpeakingByRoomId((current) => updateRoomIdentitySetMap(current, roomId, speakingUserIds));
            setVoiceScreenShareByRoomId((current) => updateRoomIdentitySetMap(current, roomId, sharingUserIds));
        },
        [],
    );

    useEffect(() => {
        setVoiceDiscoveryReady(false);
        const homeserverUrl =
            (client as MatrixClient & {
                getHomeserverUrl?: () => string;
            }).getHomeserverUrl?.() ?? client.baseUrl;
        void initVoiceDiscovery(homeserverUrl).then(() => setVoiceDiscoveryReady(true));
        return () => {
            clearVoiceDiscovery();
        };
    }, [client]);

    useEffect(() => {
        const watchedRooms = new Set<Room>();

        const onRoomsChanged = (): void => {
            syncRoomListeners();
            setRooms(listedRooms(client));
        };

        const attachRoomListeners = (room: Room): void => {
            if (watchedRooms.has(room)) {
                return;
            }

            watchedRooms.add(room);
            room.on(RoomEvent.UnreadNotifications, onRoomsChanged);
            room.on(RoomEvent.Receipt, onRoomsChanged);
            room.currentState.on(RoomStateEvent.Events, onRoomsChanged);
        };

        const detachRoomListeners = (room: Room): void => {
            if (!watchedRooms.has(room)) {
                return;
            }

            room.removeListener(RoomEvent.UnreadNotifications, onRoomsChanged);
            room.removeListener(RoomEvent.Receipt, onRoomsChanged);
            room.currentState.removeListener(RoomStateEvent.Events, onRoomsChanged);
            watchedRooms.delete(room);
        };

        const syncRoomListeners = (): void => {
            const nextRooms = new Set(client.getRooms());

            for (const room of nextRooms) {
                attachRoomListeners(room);
            }

            for (const room of [...watchedRooms]) {
                if (!nextRooms.has(room)) {
                    detachRoomListeners(room);
                }
            }
        };

        client.on(ClientEvent.Room, onRoomsChanged);
        client.on(ClientEvent.Sync, onRoomsChanged);
        client.on(ClientEvent.AccountData, onRoomsChanged);
        client.on(RoomEvent.Timeline, onRoomsChanged);
        client.on(MatrixEventEvent.Decrypted, onRoomsChanged);

        onRoomsChanged();

        return () => {
            client.removeListener(ClientEvent.Room, onRoomsChanged);
            client.removeListener(ClientEvent.Sync, onRoomsChanged);
            client.removeListener(ClientEvent.AccountData, onRoomsChanged);
            client.removeListener(RoomEvent.Timeline, onRoomsChanged);
            client.removeListener(MatrixEventEvent.Decrypted, onRoomsChanged);

            for (const room of [...watchedRooms]) {
                detachRoomListeners(room);
            }
        };
    }, [client]);

    const visibleRooms = useMemo(
        () => rooms.filter(isVisibleMembership),
        [rooms],
    );
    const visibleRoomIdsKey = useMemo(
        () => visibleRooms.map((room) => room.roomId).sort().join("\u0000"),
        [visibleRooms],
    );
    const directRoomIds = useMemo(
        () => getDirectRoomIds(client),
        [client, rooms],
    );

    useEffect(() => {
        if (client.isGuest()) {
            return;
        }

        const ownUserId = client.getUserId() ?? "";
        if (!ownUserId) {
            return;
        }

        const hintedDirectInvites = rooms
            .filter((room) => !room.isSpaceRoom() && room.getMyMembership() === "invite")
            .flatMap((room) => {
                const inviterUserId = (room as Room & { getDMInviter?: () => string | undefined }).getDMInviter?.();
                if (typeof inviterUserId !== "string" || inviterUserId.length === 0 || inviterUserId === ownUserId) {
                    return [];
                }

                return [{ roomId: room.roomId, inviterUserId }];
            });

        if (hintedDirectInvites.length === 0) {
            return;
        }

        let cancelled = false;
        void (async () => {
            for (const inviteHint of hintedDirectInvites) {
                if (cancelled) {
                    return;
                }

                try {
                    await ensureDirectRoomMapping(client, inviteHint.roomId, inviteHint.inviterUserId);
                } catch {
                    // best-effort mapping to keep DM invites visible and stable
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [client, rooms]);
    const roomById = useMemo(
        () => new Map(visibleRooms.map((room) => [room.roomId, room])),
        [visibleRooms],
    );
    // In the order you arranged them (server menu → Move to...), new ones alphabetically after.
    const spaces = useMemo(
        () => orderSpaces(sortRoomsByName(visibleRooms.filter((room) => room.isSpaceRoom())), readSpaceOrder(client)),
        [client, visibleRooms],
    );
    const voiceChannelHintRoomIds = useMemo(() => {
        const hints = new Set<string>();
        for (const space of spaces) {
            const childOrder = readSpaceChildOrder(space);
            for (const [roomId, metadata] of childOrder.entries()) {
                if (metadata.isVoiceChannel) {
                    hints.add(roomId);
                }
            }
        }
        for (const voiceHints of refreshedVoiceChannelHintsBySpaceId.values()) {
            for (const roomId of voiceHints) {
                hints.add(roomId);
            }
        }
        return hints;
    }, [refreshedVoiceChannelHintsBySpaceId, spaces]);
    const peopleChannels = useMemo(
        () =>
            sortRoomsByActivity(
                visibleRooms.filter((room) => !room.isSpaceRoom() && directRoomIds.has(room.roomId)),
            ),
        [directRoomIds, visibleRooms],
    );
    // Joined rooms that belong to no server (not DMs): listed under Home -> Group Chats, as Discord has no other place
    // for them. Rooms that name a parent space are channels of a server and stay out.
    const homeOtherRooms = useMemo(
        () =>
            sortRoomsByActivity(
                visibleRooms.filter(
                    (room) =>
                        !room.isSpaceRoom() &&
                        !directRoomIds.has(room.roomId) &&
                        room.getMyMembership() === "join" &&
                        room.currentState.getStateEvents(EventType.SpaceParent).length === 0 &&
                        !findParentSpaceIdForRoom(room.roomId, spaces),
                ),
            ),
        [directRoomIds, spaces, visibleRooms],
    );
    // Bug reports sent to this account get their own Home section.
    const homeBugReports = useMemo(() => homeOtherRooms.filter((room) => isReceivedBugReport(room, client.getUserId())), [client, homeOtherRooms]);
    const homeGroupRooms = useMemo(() => homeOtherRooms.filter((room) => !isReceivedBugReport(room, client.getUserId())), [client, homeOtherRooms]);
    const homeRooms = useMemo(() => [...peopleChannels, ...homeOtherRooms], [homeOtherRooms, peopleChannels]);
    // Muted channels and servers (push rules, so the same on every device): dimmed, no unread counts.
    const mutedRoomIds = useMemo(
        () => new Set(visibleRooms.filter((room) => isRoomMuted(client, room.roomId)).map((room) => room.roomId)),
        [client, visibleRooms],
    );
    // Invites to rooms outside any server that aren't DMs (group chats, server notices): shown under Group Chats to
    // accept or decline. DM invites are joined on open, and server channels join automatically.
    const homeInvites = useMemo(
        () =>
            visibleRooms.filter(
                (room) =>
                    !room.isSpaceRoom() &&
                    !directRoomIds.has(room.roomId) &&
                    room.getMyMembership() === "invite" &&
                    // DM invites (is_direct) belong under Direct Messages, even before m.direct maps them.
                    !(room as Room & { getDMInviter?: () => string | undefined }).getDMInviter?.() &&
                    room.currentState.getStateEvents(EventType.SpaceParent).length === 0 &&
                    !findParentSpaceIdForRoom(room.roomId, spaces),
            ),
        [directRoomIds, spaces, visibleRooms],
    );
    const isRoomVoiceChannel = useCallback(
        (room: Room | null): boolean => Boolean(room && (isVoiceChannelRoom(room) || voiceChannelHintRoomIds.has(room.roomId))),
        [voiceChannelHintRoomIds],
    );
    const selectedSpaceRoom = useMemo(
        () =>
            selectedSpaceId === PEOPLE_SPACE_ID
                ? null
                : roomById.get(selectedSpaceId) ?? null,
        [roomById, selectedSpaceId],
    );

    const channels = useMemo(() => {
        if (selectedSpaceId === PEOPLE_SPACE_ID) {
            return homeRooms;
        }

        if (!selectedSpaceRoom || !selectedSpaceRoom.isSpaceRoom()) {
            return [];
        }

        if (selectedSpaceHierarchyJoinedRoomIds.length > 0) {
            const hierarchyRooms = selectedSpaceHierarchyJoinedRoomIds
                .map((roomId) => roomById.get(roomId))
                .filter((room): room is Room => Boolean(room && !room.isSpaceRoom() && isVisibleMembership(room)));
            if (hierarchyRooms.length > 0) {
                return sortRoomsBySpaceOrder(selectedSpaceRoom, hierarchyRooms);
            }
        }

        return getSpaceChannels(selectedSpaceRoom, roomById);
    }, [homeRooms, roomById, selectedSpaceHierarchyJoinedRoomIds, selectedSpaceId, selectedSpaceRoom]);
    const selectedSpaceView = useSpaceView(selectedSpaceId);
    const selectedSpaceBannerMxc = getSpaceBanner(selectedSpaceRoom);
    const selectedSpaceBannerUrl = selectedSpaceBannerMxc ? mediaFromMxc(client, selectedSpaceBannerMxc) : null;
    const listedChannels = useMemo(
        () =>
            selectedSpaceId !== PEOPLE_SPACE_ID && selectedSpaceView.hideMutedChannels
                ? channels.filter((room) => !mutedRoomIds.has(room.roomId) || room.roomId === activeRoomId)
                : channels,
        [activeRoomId, channels, mutedRoomIds, selectedSpaceId, selectedSpaceView.hideMutedChannels],
    );
    // Unread counts on the server icons in the rail (muted servers and channels don't count).
    const spaceUnread = useMemo(() => {
        const result = new Map<string, { count: number; activity: boolean }>();
        for (const space of spaces) {
            if (mutedRoomIds.has(space.roomId)) continue;
            let count = 0;
            let activity = false;
            for (const room of getSpaceChannels(space, roomById)) {
                if (mutedRoomIds.has(room.roomId) || room.getMyMembership() !== "join") continue;
                count += getServerUnreadCount(room);
                activity ||= Boolean(client.getUserId()) && hasUnreadActivity(room, client.getUserId() ?? "");
            }
            if (count > 0 || activity) result.set(space.roomId, { count, activity });
        }
        return result;
    }, [client, mutedRoomIds, roomById, spaces, rooms]);
    // Channels joined after a server was muted (or set to mentions only) get the server's setting.
    useEffect(() => {
        for (const space of spaces) {
            if (getSpaceNotificationMode(client, space.roomId) === RoomNotificationMode.Default) continue;
            void applySpaceNotificationMode(client, space.roomId, getSpaceChannels(space, roomById)).catch(() => undefined);
        }
    }, [client, roomById, spaces]);
    // The inbox: unread messages in every conversation you haven't muted.
    const [inboxOpen, setInboxOpen] = useState(false);
    const inboxCount = useMemo(
        () =>
            visibleRooms
                .filter((room) => !room.isSpaceRoom() && room.getMyMembership() === "join" && !mutedRoomIds.has(room.roomId))
                .reduce((total, room) => total + getServerUnreadCount(room), 0),
        [mutedRoomIds, visibleRooms, rooms],
    );
    const isMutedRoom = useCallback((roomId: string) => mutedRoomIds.has(roomId), [mutedRoomIds]);
    const describeInboxRoom = useCallback(
        (room: Room): string => {
            const parentId = findParentSpaceIdForRoom(room.roomId, spaces);
            const parent = parentId ? client.getRoom(parentId) : null;
            return parent ? `#${getRoomName(room)} · ${getRoomName(parent)}` : getRoomName(room);
        },
        [client, spaces],
    );
    // A green download arrow in the top bar when an update is out.
    const desktopUpdates = useDesktopUpdates();
    const mobileUpdates = useMobileUpdates();
    const [contextMenu, setContextMenu] = useState<{ kind: "space" | "channel"; roomId: string; x: number; y: number } | null>(null);
    const [serverProfileSpaceId, setServerProfileSpaceId] = useState<string | null>(null);

    useEffect(() => {
        if (selectedSpaceId === PEOPLE_SPACE_ID || !selectedSpaceRoom?.isSpaceRoom()) {
            setSelectedSpaceHierarchyJoinedRoomIds([]);
            setDiscoverableSpaceChannels([]);
            setJoiningDiscoverableRoomId(null);
            return;
        }

        let cancelled = false;
        const currentSpaceRoom = selectedSpaceRoom;
        const visibleRoomIds = new Set(
            visibleRoomIdsKey.length > 0 ? visibleRoomIdsKey.split("\u0000") : [],
        );
        const loadPublicChannels = async (): Promise<void> => {
            try {
                const hierarchyRooms = await getSpaceHierarchyRooms(client, currentSpaceRoom.roomId);
                if (cancelled) {
                    return;
                }
                const { childOrderOverride, customOrderOverride, voiceHintRoomIds } = await resolveSpaceHierarchyVoiceHints(
                    client,
                    currentSpaceRoom,
                    hierarchyRooms,
                );
                if (cancelled) {
                    return;
                }
                setRefreshedVoiceChannelHintsBySpaceId((current) => {
                    const currentHints = current.get(currentSpaceRoom.roomId);
                    if (voiceHintRoomIds.size === 0) {
                        if (!currentHints) {
                            return current;
                        }
                        const next = new Map(current);
                        next.delete(currentSpaceRoom.roomId);
                        return next;
                    }
                    if (areStringSetsEqual(currentHints, voiceHintRoomIds)) {
                        return current;
                    }
                    const next = new Map(current);
                    next.set(currentSpaceRoom.roomId, voiceHintRoomIds);
                    return next;
                });
                setSelectedSpaceHierarchyJoinedRoomIds(
                    buildJoinedHierarchyChannelIds(currentSpaceRoom, hierarchyRooms, visibleRoomIds, childOrderOverride, customOrderOverride),
                );
                const channelsToJoin = buildDiscoverableSpaceChannels(
                    currentSpaceRoom,
                    hierarchyRooms,
                    visibleRoomIds,
                    childOrderOverride,
                    customOrderOverride,
                    voiceHintRoomIds,
                );
                setDiscoverableSpaceChannels(channelsToJoin);

                const successfullyJoinedIds: string[] = [];
                for (const channel of channelsToJoin) {
                    if (cancelled) {
                        return;
                    }

                    const viaServers = channel.viaServers?.filter((v) => v.length > 0) ?? [];
                    try {
                        const joinedChannel = await joinRoomWithRetry(client, channel.roomId, { viaServers });
                        const latestJoinedChannel = client.getRoom(channel.roomId) ?? joinedChannel;
                        if (latestJoinedChannel.getMyMembership() === "join") {
                            successfullyJoinedIds.push(channel.roomId);
                        }
                    } catch {
                        // Keep channel in discoverable list when join fails.
                    }
                }
                if (cancelled) return;

                // Immediately update channel list using already-fetched hierarchy data.
                // Don't wait for visibleRoomIdsKey change + another HTTP hierarchy call.
                if (successfullyJoinedIds.length > 0) {
                    const successfulRoomIds = new Set(successfullyJoinedIds);
                    const updatedVisibleRoomIds = new Set([...visibleRoomIds, ...successfullyJoinedIds]);
                    setSelectedSpaceHierarchyJoinedRoomIds(
                        buildJoinedHierarchyChannelIds(currentSpaceRoom, hierarchyRooms, updatedVisibleRoomIds, childOrderOverride, customOrderOverride),
                    );
                    setDiscoverableSpaceChannels((current) =>
                        current.filter((channel) => !successfulRoomIds.has(channel.roomId)),
                    );
                }
            } catch {
                if (!cancelled) {
                    setSelectedSpaceHierarchyJoinedRoomIds([]);
                    setDiscoverableSpaceChannels([]);
                    setRefreshedVoiceChannelHintsBySpaceId((current) => {
                        if (!current.has(currentSpaceRoom.roomId)) {
                            return current;
                        }
                        const next = new Map(current);
                        next.delete(currentSpaceRoom.roomId);
                        return next;
                    });
                }
            }
        };

        void loadPublicChannels();

        return () => {
            cancelled = true;
        };
    }, [client, selectedSpaceId, selectedSpaceRoom, visibleRoomIdsKey]);

    const showSpaceOnboarding =
        Boolean(spaceOnboardingSpaceId) &&
        selectedSpaceId === spaceOnboardingSpaceId &&
        Boolean(selectedSpaceRoom) &&
        channels.length === 0 &&
        discoverableSpaceChannels.length === 0;

    useEffect(() => {
        if (selectedSpaceId === PEOPLE_SPACE_ID) {
            return;
        }

        if (!spaces.some((space) => space.roomId === selectedSpaceId)) {
            setSelectedSpaceId(PEOPLE_SPACE_ID);
        }
    }, [selectedSpaceId, spaces]);

    useEffect(() => {
        const visibleSpaceIds = new Set(spaces.map((space) => space.roomId));
        setRefreshedVoiceChannelHintsBySpaceId((current) => {
            let changed = false;
            const next = new Map<string, Set<string>>();

            for (const [spaceId, roomIds] of current.entries()) {
                if (!visibleSpaceIds.has(spaceId)) {
                    changed = true;
                    continue;
                }
                next.set(spaceId, roomIds);
            }

            return changed ? next : current;
        });
    }, [spaces]);

    useEffect(() => {
        if (pendingFocusRoomId) {
            if (channels.some((room) => room.roomId === pendingFocusRoomId)) {
                openRoomAtBottom(pendingFocusRoomId);
                setPendingFocusRoomId(null);
            }
            return;
        }

        if (channels.length === 0) {
            setActiveRoomId(null);
            return;
        }

        if (!activeRoomId) {
            openRoomAtBottom(channels[0].roomId);
            return;
        }

        if (!channels.some((room) => room.roomId === activeRoomId)) {
            const selectedSpaceIsPeople = selectedSpaceId === PEOPLE_SPACE_ID;
            const activeRoomIsDirect = directRoomIds.has(activeRoomId);
            if (selectedSpaceIsPeople && activeRoomIsDirect) {
                return;
            }

            openRoomAtBottom(channels[0].roomId);
        }
    }, [activeRoomId, channels, directRoomIds, openRoomAtBottom, pendingFocusRoomId, selectedSpaceId]);

    useEffect(() => {
        setReplyToEvent(null);
        setEditingEvent(null);
    }, [activeRoomId]);

    useEffect(() => {
        setSidebarSearchQuery("");
    }, [activeRoomId]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        window.localStorage.setItem(RIGHT_SIDEBAR_MODE_STORAGE_KEY, rightSidebarMode);
    }, [rightSidebarMode]);

    const activeRoom = useMemo(
        () => (activeRoomId ? roomById.get(activeRoomId) ?? null : null),
        [activeRoomId, roomById],
    );
    const activeThread = openThread && openThread.roomId === activeRoom?.roomId ? openThread : null;
    const roomSettingsRoom = useMemo(
        () => (roomSettingsRoomId ? client.getRoom(roomSettingsRoomId) ?? null : null),
        [client, roomSettingsRoomId],
    );
    const inviteTargetRoom = useMemo(
        () => (inviteTargetRoomId ? roomById.get(inviteTargetRoomId) ?? client.getRoom(inviteTargetRoomId) ?? null : activeRoom),
        [activeRoom, client, inviteTargetRoomId, roomById],
    );
    const { panelMode, selectUser, clearSelectedUser } = useSelectedUser(activeRoom?.roomId ?? null);
    const ownUserId = client.getUserId() ?? "";
    const canInviteInActiveRoom = Boolean(activeRoom && ownUserId && activeRoom.canInvite(ownUserId));
    const ownUser = ownUserId ? client.getUser(ownUserId) : null;
    const ownDisplayName = ownUser?.displayName || ownUserId || "User";
    const ownAvatarMxc = ownUser?.avatarUrl || "";
    const ownAvatarSources = useMemo(
        () =>
            Array.from(
                new Set(
                    [
                        thumbnailFromMxc(client, ownAvatarMxc, 64, 64, "crop"),
                        mediaFromMxc(client, ownAvatarMxc),
                    ].filter((url): url is string => Boolean(url)),
                ),
            ),
        [client, ownAvatarMxc],
    );
    const selectedSpaceName =
        selectedSpaceId === PEOPLE_SPACE_ID
              ? "People"
              : selectedSpaceRoom
                ? getRoomName(selectedSpaceRoom)
                : "People";
    const isActiveRoomDirect = Boolean(activeRoom && directRoomIds.has(activeRoom.roomId));
    const shouldShowReadReceipts =
        userSettings.privacy.showReadReceipts && selectedSpaceId === PEOPLE_SPACE_ID && isActiveRoomDirect;
    const isActiveRoomVoiceChannel = isRoomVoiceChannel(activeRoom);
    const shouldShowVoicePanel = Boolean(activeRoom && isActiveRoomVoiceChannel && voiceSessionRoomId === activeRoom.roomId);
    // Voice channels with text chat turned on (channel settings) show it beside the call.
    const voiceChatBeside = shouldShowVoicePanel && isVoiceChatEnabled(activeRoom);
    const shouldPrefixRoomWithHash = selectedSpaceId !== PEOPLE_SPACE_ID;
    const activeVoiceSessionRoom = useMemo(
        () => (voiceSessionRoomId ? roomById.get(voiceSessionRoomId) ?? client.getRoom(voiceSessionRoomId) ?? null : null),
        [client, roomById, voiceSessionRoomId],
    );
    const hasActiveVoiceSession = Boolean(
        voiceSessionRoomId && (voiceSessionStatus === "connected" || voiceSessionStatus === "joining"),
    );
    // Calls outside voice channels belong to Home conversations only (DMs, group chats, rooms outside servers);
    // server text channels have none, as in Discord.
    const roomCalls = useRoomCalls(client, homeRooms);
    const ringableRoomIds = useMemo(() => new Set(homeRooms.map((room) => room.roomId)), [homeRooms]);
    const { incoming: incomingCall, dismiss: dismissIncomingCall } = useIncomingCall({
        client,
        ringableRoomIds,
        roomCalls,
        currentCallRoomId: hasActiveVoiceSession ? voiceSessionRoomId : null,
    });
    const isActiveRoomCallable = Boolean(
        activeRoom && !isActiveRoomVoiceChannel && homeRooms.some((room) => room.roomId === activeRoom.roomId),
    );
    const activeRoomCallOthers = useMemo(
        () => (activeRoom ? (roomCalls.get(activeRoom.roomId) ?? []).filter((userId) => userId !== ownUserId) : []),
        [activeRoom, ownUserId, roomCalls],
    );
    const isInActiveRoomCall = Boolean(activeRoom && hasActiveVoiceSession && voiceSessionRoomId === activeRoom.roomId);
    const shouldShowCallStrip = isActiveRoomCallable && isInActiveRoomCall;
    const liveVoiceParticipantsOverrideRoomId =
        voiceSessionRoomId && (voiceSessionStatus === "connected" || voiceSessionStatus === "joining")
            ? voiceSessionRoomId
            : null;
    useEffect(() => {
        setFeatureRenderReactionImages(renderReactionImages);
    }, [renderReactionImages]);

    useEffect(() => {
        saveUserLocalSettings(userSettings);
        applyAppearanceTheme(userSettings.appearance);
    }, [userSettings]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const bridge = window.heorotDesktop;
        if (!bridge?.setCloseOnWindowCloseMinimize) {
            return;
        }

        void bridge.setCloseOnWindowCloseMinimize(userSettings.appearance.closeOnWindowCloseMinimize);
    }, [userSettings.appearance.closeOnWindowCloseMinimize]);

    useEffect(() => {
        if (isRoomVoiceChannel(activeRoom) && !voiceSessionRoomId && activeRoom) {
            setVoiceSessionRoomId(activeRoom.roomId);
        }
    }, [activeRoom, isRoomVoiceChannel, voiceSessionRoomId]);

    useEffect(() => {
        if (!voiceSessionRoomId) {
            return;
        }
        if (roomById.has(voiceSessionRoomId)) {
            return;
        }
        setVoiceSessionRoomId(null);
        setVoiceSessionStatus("disconnected");
    }, [roomById, voiceSessionRoomId]);

    useEffect(() => {
        if (voiceSessionRoomId) {
            return;
        }
        voiceControlStateRef.current = DEFAULT_VOICE_CONTROL_STATE;
        pendingVoiceControlTargetRef.current = null;
        setVoiceControlState(DEFAULT_VOICE_CONTROL_STATE);
    }, [voiceSessionRoomId]);

    useEffect(() => {
        if (!settingsState || settingsState.mode !== "server") {
            return;
        }

        if (selectedSpaceId === PEOPLE_SPACE_ID || !selectedSpaceRoom) {
            setSettingsState(null);
        }
    }, [selectedSpaceId, selectedSpaceRoom, settingsState]);

    const pushToast = useCallback((nextToast: Omit<ToastState, "id">): void => {
        if (nextToast.type === "error") logAppError("app", nextToast.message);
        setToast({
            id: Date.now(),
            ...nextToast,
        });
    }, []);

    const copyActiveRoomLink = useCallback(async (): Promise<void> => {
        if (!activeRoom) {
            return;
        }

        try {
            await copyText(buildMatrixToRoomPermalink(activeRoom.roomId));
            pushToast({ type: "success", message: "Room link copied." });
        } catch (copyError) {
            const message = copyError instanceof Error ? copyError.message : "Failed to copy room link.";
            pushToast({ type: "error", message });
        }
    }, [activeRoom, pushToast]);

    const reloadSpaceChannelsFromServer = useCallback(
        async (spaceId: string): Promise<void> => {
            const targetSpace = client.getRoom(spaceId);
            if (!targetSpace || !targetSpace.isSpaceRoom()) {
                pushToast({ type: "error", message: "Unable to reload channels: selected server is unavailable." });
                return;
            }

            try {
                let hierarchySpaceRoom = targetSpace;
                if (hierarchySpaceRoom.getMyMembership() !== "join") {
                    const fallbackViaServers = getViaServersForParentSpace(client, hierarchySpaceRoom.roomId);
                    try {
                        await joinRoomWithRetry(client, hierarchySpaceRoom.roomId, {
                            viaServers: fallbackViaServers,
                            maxAttempts: 1,
                        });
                    } catch {
                        // Best-effort join for users invited only to a child channel.
                    }

                    const refreshedSpaceRoom = client.getRoom(hierarchySpaceRoom.roomId);
                    if (refreshedSpaceRoom?.isSpaceRoom()) {
                        hierarchySpaceRoom = refreshedSpaceRoom;
                    }
                }

                if (hierarchySpaceRoom.getMyMembership() !== "join") {
                    setSelectedSpaceHierarchyJoinedRoomIds([]);
                    setDiscoverableSpaceChannels([]);
                    setJoiningDiscoverableRoomId(null);
                    setRooms(listedRooms(client));
                    pushToast({
                        type: "error",
                        message: "Can't load server hierarchy because you're not joined to the server room.",
                    });
                    return;
                }

                const hierarchyRooms = await getSpaceHierarchyRooms(client, hierarchySpaceRoom.roomId);
                const { childOrderOverride, voiceHintRoomIds: refreshedVoiceHints } = await resolveSpaceHierarchyVoiceHints(
                    client,
                    hierarchySpaceRoom,
                    hierarchyRooms,
                );

                setRefreshedVoiceChannelHintsBySpaceId((current) => {
                    const currentHints = current.get(spaceId);
                    if (refreshedVoiceHints.size === 0) {
                        if (!currentHints) {
                            return current;
                        }
                        const next = new Map(current);
                        next.delete(spaceId);
                        return next;
                    }
                    if (areStringSetsEqual(currentHints, refreshedVoiceHints)) {
                        return current;
                    }
                    const next = new Map(current);
                    next.set(spaceId, refreshedVoiceHints);
                    return next;
                });

                const hierarchyChannelRoomIds = hierarchyRooms
                    .filter((room) => room.room_id !== hierarchySpaceRoom.roomId)
                    .filter((room) => room.room_type !== "m.space")
                    .map((room) => room.room_id);
                const allHierarchyChannelIds = new Set(hierarchyChannelRoomIds);
                const latestVisibleRoomIds = new Set(
                    client
                        .getRooms()
                        .filter(isVisibleMembership)
                        .map((room) => room.roomId),
                );
                const hierarchyOrderForSpace = buildJoinedHierarchyChannelIds(
                    hierarchySpaceRoom,
                    hierarchyRooms,
                    allHierarchyChannelIds,
                    childOrderOverride,
                    [],
                );
                const joinedHierarchyOrder = hierarchyOrderForSpace.filter((roomId) => latestVisibleRoomIds.has(roomId));

                const ownUserId = client.getUserId() ?? "";
                const canPersistHierarchyOrder =
                    ownUserId.length > 0 && hierarchySpaceRoom.currentState.maySendStateEvent(CHANNEL_ORDER_STATE_EVENT, ownUserId);
                if (canPersistHierarchyOrder) {
                    const currentOrder = readChannelOrder(hierarchySpaceRoom);
                    const seenHierarchyIds = new Set(hierarchyOrderForSpace);
                    const mergedOrder = [
                        ...hierarchyOrderForSpace,
                        ...currentOrder.filter((roomId) => !seenHierarchyIds.has(roomId)),
                    ];
                    if (!areStringArraysEqual(currentOrder, mergedOrder)) {
                        await writeChannelOrder(client, hierarchySpaceRoom.roomId, mergedOrder);
                    }
                }

                setSelectedSpaceHierarchyJoinedRoomIds(joinedHierarchyOrder);
                setDiscoverableSpaceChannels(
                    buildDiscoverableSpaceChannels(
                        hierarchySpaceRoom,
                        hierarchyRooms,
                        latestVisibleRoomIds,
                        childOrderOverride,
                        hierarchyOrderForSpace,
                        refreshedVoiceHints,
                    ),
                );
                setJoiningDiscoverableRoomId(null);
                setRooms(listedRooms(client));
                pushToast({ type: "success", message: "Channels reloaded from server hierarchy." });
            } catch (reloadError) {
                const message = reloadError instanceof Error ? reloadError.message : "Failed to reload channels.";
                pushToast({ type: "error", message });
            }
        },
        [client, pushToast],
    );

    const runVoiceRoomAction = useCallback(
        (action: (voiceRoom: VoiceRoomHandle) => Promise<void>, fallbackMessage: string): void => {
            const voiceRoom = voiceRoomRef.current;
            if (!voiceRoom) {
                return;
            }

            void action(voiceRoom).catch((voiceActionError) => {
                const message = voiceActionError instanceof Error ? voiceActionError.message : fallbackMessage;
                pushToast({ type: "error", message });
            });
        },
        [pushToast],
    );

    const joinVoiceFromDock = useCallback((): void => {
        if (!voiceSessionRoomId || voiceSessionStatus !== "disconnected") {
            return;
        }

        runVoiceRoomAction((voiceRoom) => voiceRoom.join(), "Unable to join voice channel.");
    }, [runVoiceRoomAction, voiceSessionRoomId, voiceSessionStatus]);

    const leaveVoiceFromDock = useCallback((): void => {
        if (!voiceSessionRoomId || voiceSessionStatus === "disconnected") {
            return;
        }

        runVoiceRoomAction((voiceRoom) => voiceRoom.leave(), "Unable to leave voice channel.");
    }, [runVoiceRoomAction, voiceSessionRoomId, voiceSessionStatus]);

    // Mute/deafen from the user panel work in and out of calls. Outside a call they only change the saved choice,
    // which the next call starts with; in a call the change is applied to the voice room too.
    const applySelfVoiceState = useCallback(
        (next: SelfVoiceState): void => {
            setSelfVoice(next);
            if (!voiceSessionRoomId || voiceSessionStatus !== "connected") {
                return;
            }
            const current = voiceControlStateRef.current;
            if (next.muted === current.micMuted && next.deafened === current.audioMuted) {
                return;
            }
            pendingVoiceControlTargetRef.current = { micMuted: next.muted, audioMuted: next.deafened };
            if (next.muted !== current.micMuted) {
                runVoiceRoomAction((voiceRoom) => voiceRoom.toggleMute(), "Unable to update microphone state.");
            }
            if (next.deafened !== current.audioMuted) {
                runVoiceRoomAction((voiceRoom) => voiceRoom.toggleAudioMute(), "Unable to update audio output state.");
            }
        },
        [runVoiceRoomAction, voiceSessionRoomId, voiceSessionStatus],
    );

    const toggleVoiceMicFromDock = useCallback((): void => {
        applySelfVoiceState(toggleSelfMute(selfVoice));
    }, [applySelfVoiceState, selfVoice]);

    const toggleVoiceAudioFromDock = useCallback((): void => {
        applySelfVoiceState(toggleSelfDeafen(selfVoice));
    }, [applySelfVoiceState, selfVoice]);

    // Keeps the saved choice in step with mute/deafen changed inside the call view. Changes the user panel asked
    // for arrive in steps (mic, then audio); those are skipped until the room reaches the requested state.
    const handleVoiceControlsStateChange = useCallback((state: VoiceControlState): void => {
        voiceControlStateRef.current = state;
        setVoiceControlState(state);
        if (!state.connected) {
            return;
        }
        const target = pendingVoiceControlTargetRef.current;
        if (target) {
            if (target.micMuted === state.micMuted && target.audioMuted === state.audioMuted) {
                pendingVoiceControlTargetRef.current = null;
            }
            return;
        }
        setSelfVoice((current) =>
            current.muted === state.micMuted && current.deafened === state.audioMuted
                ? current
                : { muted: state.micMuted, deafened: state.audioMuted, mutedByDeafen: false },
        );
    }, []);

    // The desktop tray menu mirrors mute/deafen and status, and its choices act here.
    useEffect(() => {
        void window.heorotDesktop?.setTrayState?.({ muted: selfVoice.muted, deafened: selfVoice.deafened, status: ownStatus.state });
    }, [ownStatus.state, selfVoice.deafened, selfVoice.muted]);
    const trayActionRef = useRef<(action: { type: string; status?: string }) => void>(() => undefined);
    trayActionRef.current = (action) => {
        if (action.type === "toggleMute") toggleVoiceMicFromDock();
        else if (action.type === "toggleDeafen") toggleVoiceAudioFromDock();
        else if (action.type === "setStatus" && ["auto", "online", "idle", "dnd", "invisible"].includes(action.status ?? "")) {
            setOwnStatus((current) => ({ ...current, state: action.status as OwnStatus["state"] }));
        }
    };
    useEffect(() => window.heorotDesktop?.onTrayAction?.((action) => trayActionRef.current(action)), []);

    // Below 1100px the members/profile panel slides over the chat, so it only opens when asked for and closing it
    // there doesn't change the saved (desktop) panel choice.
    const isNarrowLayout = useMediaQuery("(max-width: 1100px)");
    const [narrowPanelOpen, setNarrowPanelOpen] = useState(false);
    useEffect(() => {
        setNarrowPanelOpen(false);
    }, [activeRoomId]);

    const selectSidebarMode = useCallback(
        (mode: RightSidebarMode): void => {
            clearSelectedUser();
            if (isNarrowLayout) {
                setNarrowPanelOpen(mode !== "closed");
                if (mode === "closed") {
                    return;
                }
            }
            setRightSidebarMode(mode);
        },
        [clearSelectedUser, isNarrowLayout],
    );

    // Phone layout: opening a chat adds a history entry, so Android's Back button (Capacitor goes back in the
    // WebView's history first) returns to the list instead of closing the app.
    const isPhoneLayout = useMediaQuery("(max-width: 760px)");
    useEffect(() => {
        if (!isPhoneLayout || mobilePane !== "chat") {
            return;
        }
        if ((window.history.state as { meadhallPane?: string } | null)?.meadhallPane !== "chat") {
            window.history.pushState({ ...(window.history.state ?? {}), meadhallPane: "chat" }, "");
        }
    }, [isPhoneLayout, mobilePane]);
    useEffect(() => {
        const onPopState = (): void => {
            if ((window.history.state as { meadhallPane?: string } | null)?.meadhallPane !== "chat") {
                setMobilePane("list");
            }
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);
    const goBackToList = useCallback((): void => {
        if ((window.history.state as { meadhallPane?: string } | null)?.meadhallPane === "chat") {
            window.history.back();
            return;
        }
        setMobilePane("list");
    }, []);

    // Phones: swipe right in a chat to go back to the list (Direct Messages / channels), swipe left from the list to
    // return to the open chat, like the Discord app.
    useEffect(() => {
        if (!isPhoneLayout) {
            return undefined;
        }
        let start: { x: number; y: number; at: number } | null = null;
        const onStart = (event: TouchEvent): void => {
            const target = event.target as HTMLElement | null;
            const ignored = target?.closest("input, textarea, [contenteditable=\"true\"], .settings-nav, .pixel-color-wheel, .voice-room-panel");
            start = event.touches.length === 1 && !ignored ? { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now() } : null;
        };
        const onEnd = (event: TouchEvent): void => {
            if (!start || event.changedTouches.length === 0) {
                return;
            }
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            const quick = Date.now() - start.at < 600;
            start = null;
            if (!quick || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) {
                return;
            }
            if (dx > 0 && mobilePane === "chat") {
                goBackToList();
            } else if (dx < 0 && mobilePane === "list" && activeRoomId) {
                setMobilePane("chat");
            }
        };
        window.addEventListener("touchstart", onStart, { passive: true });
        window.addEventListener("touchend", onEnd, { passive: true });
        return () => {
            window.removeEventListener("touchstart", onStart);
            window.removeEventListener("touchend", onEnd);
        };
    }, [activeRoomId, goBackToList, isPhoneLayout, mobilePane]);

    const selectUserAndOpenPanel = useCallback(
        (userId: string): void => {
            selectUser(userId);
            setNarrowPanelOpen(true);
        },
        [selectUser],
    );

    const selectChannel = useCallback(
        (roomId: string): void => {
            setPendingFocusRoomId(null);
            openRoomAtBottom(roomId);
            setMobilePane("chat");
            const room = roomById.get(roomId) ?? client.getRoom(roomId);
            if (!room || !isRoomVoiceChannel(room)) {
                return;
            }

            const sameVoiceSessionRoom = voiceSessionRoomId === roomId;
            if (sameVoiceSessionRoom && (voiceSessionStatus === "connected" || voiceSessionStatus === "joining")) {
                return;
            }

            setVoiceSessionRoomId(roomId);
            setVoiceSessionStatus("joining");
            setVoiceAutoJoinNonce((value) => value + 1);
        },
        [client, isRoomVoiceChannel, openRoomAtBottom, roomById, voiceSessionRoomId, voiceSessionStatus],
    );

    // Starts (or joins) the call in a DM, group chat or room. Nobody has to answer: the call stays up while anyone
    // is in it, and the others get a call notification (never a ring).
    const startCallInRoom = useCallback(
        (roomId: string): void => {
            const alreadyInCall =
                voiceSessionRoomId === roomId && (voiceSessionStatus === "connected" || voiceSessionStatus === "joining");
            if (alreadyInCall) {
                return;
            }
            setVoiceSessionRoomId(roomId);
            setVoiceSessionStatus("joining");
            setVoiceAutoJoinNonce((value) => value + 1);
        },
        [voiceSessionRoomId, voiceSessionStatus],
    );

    const focusRoom = useCallback(
        (roomId: string): void => {
            const room = client.getRoom(roomId);
            if (!room) {
                setPendingFocusRoomId(roomId);
                setSelectedSpaceId(PEOPLE_SPACE_ID);
                return;
            }

            if (room.isSpaceRoom()) {
                setSelectedSpaceId(room.roomId);
                setActiveRoomId(null);
                setPendingFocusRoomId(null);
                return;
            }

            if (directRoomIds.has(roomId)) {
                setSelectedSpaceId(PEOPLE_SPACE_ID);
            } else {
                const parentSpaceId = findParentSpaceIdForRoom(roomId, spaces);
                if (parentSpaceId) {
                    setSelectedSpaceId(parentSpaceId);
                } else {
                    setSelectedSpaceId(PEOPLE_SPACE_ID);
                }
            }

            openRoomAtBottom(roomId);
            setMobilePane("chat");
            setPendingFocusRoomId(null);
        },
        [client, directRoomIds, openRoomAtBottom, spaces],
    );

    // The profile card's Call button: open (or create) the DM with that person and start its call.
    const callUser = useCallback(
        async (userId: string): Promise<void> => {
            try {
                const { roomId } = await createOrReuseDirectChat(client, userId);
                focusRoom(roomId);
                startCallInRoom(roomId);
            } catch (callError) {
                const message = callError instanceof Error ? callError.message : "Unable to start the call.";
                pushToast({ type: "error", message });
            }
        },
        [client, focusRoom, pushToast, startCallInRoom],
    );

    const requestJoinRoom = useCallback(
        async (target: string, options?: { viaServers?: string[]; preferredSpaceId?: string | null }): Promise<string> => {
            const joinedRoom = await joinRoomWithRetry(client, target, { viaServers: options?.viaServers });

            if (joinedRoom.isSpaceRoom()) {
                setSelectedSpaceId(joinedRoom.roomId);
                setActiveRoomId(null);
                setPendingFocusRoomId(null);
                setRooms(listedRooms(client));
                return joinedRoom.roomId;
            }

            let joinedParentSpaceId: string | null = null;
            if (!directRoomIds.has(joinedRoom.roomId)) {
                joinedParentSpaceId = await ensureRoomParentSpacesJoined(client, joinedRoom, options?.preferredSpaceId ?? null);
            }
            setRooms(listedRooms(client));

            if (directRoomIds.has(joinedRoom.roomId)) {
                setSelectedSpaceId(PEOPLE_SPACE_ID);
            } else {
                const parentSpaceId =
                    joinedParentSpaceId ??
                    findParentSpaceIdForRoom(joinedRoom.roomId, spaces) ??
                    options?.preferredSpaceId ??
                    null;
                if (parentSpaceId) {
                    setSelectedSpaceId(parentSpaceId);
                } else {
                    setSelectedSpaceId(PEOPLE_SPACE_ID);
                }
            }

            openRoomAtBottom(joinedRoom.roomId);
            setPendingFocusRoomId(null);

            if (options?.preferredSpaceId && options.preferredSpaceId === selectedSpaceId) {
                setSelectedSpaceHierarchyJoinedRoomIds((current) =>
                    current.includes(joinedRoom.roomId) ? current : [...current, joinedRoom.roomId],
                );
                setDiscoverableSpaceChannels((current) =>
                    current.filter((channel) => channel.roomId !== joinedRoom.roomId),
                );
            }

            return joinedRoom.roomId;
        },
        [client, directRoomIds, openRoomAtBottom, selectedSpaceId, spaces],
    );

    const joinDiscoverableSpaceChannel = useCallback(
        async (roomId: string): Promise<void> => {
            if (joiningDiscoverableRoomId) {
                return;
            }

            const targetChannel = discoverableSpaceChannels.find((channel) => channel.roomId === roomId);
            if (!targetChannel) {
                return;
            }

            setJoiningDiscoverableRoomId(roomId);
            try {
                const viaServers = targetChannel.viaServers?.filter((via) => via.length > 0) ?? [];
                await requestJoinRoom(roomId, {
                    viaServers,
                    preferredSpaceId: selectedSpaceId === PEOPLE_SPACE_ID ? null : selectedSpaceId,
                });
                pushToast({ type: "success", message: "Joined channel." });
            } catch (joinError) {
                pushToast({ type: "error", message: describeJoinError(joinError, roomId) });
            } finally {
                setJoiningDiscoverableRoomId(null);
            }
        },
        [discoverableSpaceChannels, joiningDiscoverableRoomId, pushToast, requestJoinRoom, selectedSpaceId],
    );

    useEffect(() => {
        if (!activeRoomId) {
            return;
        }

        const activeRoomCandidate = client.getRoom(activeRoomId);
        if (!activeRoomCandidate || activeRoomCandidate.isSpaceRoom()) {
            return;
        }
        if (!directRoomIds.has(activeRoomCandidate.roomId)) {
            return;
        }

        const membership = activeRoomCandidate.getMyMembership();
        if (membership === "join") {
            autoJoiningDirectRoomIdsRef.current.delete(activeRoomCandidate.roomId);
            return;
        }
        if (membership !== "invite" && membership !== "knock") {
            return;
        }
        if (autoJoiningDirectRoomIdsRef.current.has(activeRoomCandidate.roomId)) {
            return;
        }

        autoJoiningDirectRoomIdsRef.current.add(activeRoomCandidate.roomId);
        void requestJoinRoom(activeRoomCandidate.roomId, { preferredSpaceId: null })
            .catch((joinError) => {
                pushToast({
                    type: "error",
                    message: describeJoinError(joinError, activeRoomCandidate.roomId),
                });
            })
            .finally(() => {
                autoJoiningDirectRoomIdsRef.current.delete(activeRoomCandidate.roomId);
            });
    }, [activeRoomId, client, directRoomIds, pushToast, requestJoinRoom]);

    useEffect(() => {
        if (!pendingFocusRoomId) {
            return;
        }

        const room = client.getRoom(pendingFocusRoomId);
        if (!room || room.isSpaceRoom()) {
            return;
        }

        if (directRoomIds.has(pendingFocusRoomId)) {
            setSelectedSpaceId(PEOPLE_SPACE_ID);
        } else {
            const parentSpaceId = findParentSpaceIdForRoom(pendingFocusRoomId, spaces);
            if (parentSpaceId) {
                setSelectedSpaceId(parentSpaceId);
            } else {
                setSelectedSpaceId(PEOPLE_SPACE_ID);
            }
        }

        openRoomAtBottom(pendingFocusRoomId);
        setPendingFocusRoomId(null);
    }, [client, directRoomIds, openRoomAtBottom, pendingFocusRoomId, spaces]);

    // Private channels (Server Settings -> Members & roles -> Channel access) are invite-only: when a server you're
    // in invites you to one of its channels because you got a role, join it automatically.
    const autoJoiningChannelIdsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        for (const room of rooms) {
            if (room.isSpaceRoom() || room.getMyMembership() !== "invite" || directRoomIds.has(room.roomId)) {
                continue;
            }
            if (!findParentSpaceIdForRoom(room.roomId, spaces) || autoJoiningChannelIdsRef.current.has(room.roomId)) {
                continue;
            }
            autoJoiningChannelIdsRef.current.add(room.roomId);
            void joinRoomWithRetry(client, room.roomId)
                .catch(() => undefined)
                .finally(() => autoJoiningChannelIdsRef.current.delete(room.roomId));
        }
    }, [client, directRoomIds, rooms, spaces]);

    const leaveActiveRoom = useCallback(async (): Promise<void> => {
        if (!activeRoom) {
            return;
        }

        const roomLabel = getRoomName(activeRoom);
        if (!window.confirm(`Leave "${roomLabel}"?`)) {
            return;
        }

        try {
            await client.leave(activeRoom.roomId);
            setReplyToEvent(null);
            setEditingEvent(null);
            setInviteOpen(false);
            setRoomSettingsRoomId(null);
            setRoomModerationOpen(false);
            pushToast({ type: "success", message: `Left ${roomLabel}.` });
        } catch (leaveError) {
            const message = leaveError instanceof Error ? leaveError.message : "Failed to leave room.";
            pushToast({ type: "error", message });
        }
    }, [activeRoom, client, pushToast]);

    const openRoomSettingsFor = useCallback(
        (roomId: string | null): void => {
            if (!roomId) {
                return;
            }

            setRoomSettingsRoomId(roomId);
        },
        [],
    );

    const openUserSettings = useCallback((tab = "my-account"): void => {
        setSettingsState({
            mode: "user",
            tab,
        });
    }, []);

    const openServerSettings = useCallback((tab = "overview"): void => {
        if (!selectedSpaceRoom) {
            return;
        }

        setSettingsState({
            mode: "server",
            tab,
        });
    }, [selectedSpaceRoom]);

    const openCreateRoomDialog = useCallback((parentSpaceId: string | null): void => {
        setCreateRoomParentSpaceId(parentSpaceId);
        setCreateRoomOpen(true);
    }, []);

    const openInviteDialogFor = useCallback((roomId: string | null): void => {
        if (!roomId) {
            return;
        }
        setInviteTargetRoomId(roomId);
        setInviteOpen(true);
    }, []);

    const shouldRenderRightPanel =
        (panelMode.mode === "user" || rightSidebarMode !== "closed") && (!isNarrowLayout || narrowPanelOpen);

    const [channelsPaneWidth, setChannelsPaneWidth] = useState<number>(readChannelsPaneWidth);
    const [isResizingPane, setIsResizingPane] = useState(false);

    const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = channelsPaneWidth;
        setIsResizingPane(true);

        const onMove = (ev: PointerEvent): void => {
            const next = Math.min(CHANNELS_PANE_MAX, Math.max(CHANNELS_PANE_MIN, startWidth + ev.clientX - startX));
            setChannelsPaneWidth(next);
        };
        const onUp = (ev: PointerEvent): void => {
            const final = Math.min(CHANNELS_PANE_MAX, Math.max(CHANNELS_PANE_MIN, startWidth + ev.clientX - startX));
            setChannelsPaneWidth(final);
            try { window.localStorage.setItem(CHANNELS_PANE_WIDTH_KEY, String(Math.round(final))); } catch { /* ignore */ }
            setIsResizingPane(false);
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }, [channelsPaneWidth]);

    // The grid itself lives in CSS (App.css "Layout"), so phone and tablet layouts can change it.
    const appShellStyle = useMemo(
        () => ({ ["--channels-pane-width" as string]: `${channelsPaneWidth}px` }) as React.CSSProperties,
        [channelsPaneWidth],
    );

    const appShellClassName = useMemo(() => {
        const classes = ["app-shell"];
        classes.push(mobilePane === "chat" ? "mobile-show-chat" : "mobile-show-list");
        if (userSettings.appearance.compactMode) {
            classes.push("is-compact");
        }
        if (!userSettings.appearance.showTimestamps) {
            classes.push("hide-timestamps");
        }
        if (!shouldRenderRightPanel) {
            classes.push("right-panel-collapsed");
        }
        if (isResizingPane) {
            classes.push("is-resizing");
        }
        if (typeof window !== "undefined" && window.heorotDesktop) {
            classes.push("is-desktop-runtime");
            if (window.heorotDesktop.platform === "win32") {
                classes.push("is-desktop-win32");
            }
        }
        return classes.join(" ");
    }, [mobilePane, shouldRenderRightPanel, isResizingPane, userSettings.appearance.compactMode, userSettings.appearance.showTimestamps]);

    const hasOpenDialog = Boolean(
        emojiUploadOpen ||
            createDirectChatOpen ||
            createRoomOpen ||
            createSpaceOpen ||
            importJsonOpen ||
            joinRoomOpen ||
            inviteOpen ||
            roomSettingsRoomId ||
            roomModerationOpen ||
            settingsState,
    );

    // Android app: keep notifying in the background (native service) while notifications are on.
    useEffect(() => {
        const accessToken = client.getAccessToken();
        const userId = client.getUserId();
        if (!userSettings.notifications.notificationsEnabled || !accessToken || !userId) {
            void stopAndroidBackgroundSync();
            return undefined;
        }
        void startAndroidBackgroundSync({
            homeserverUrl: client.getHomeserverUrl(),
            accessToken,
            userId,
            showMessageText: userSettings.notifications.notificationBodyEnabled,
        });
        return onAccessTokenRefreshed((token) => void updateAndroidBackgroundSyncToken(token));
    }, [client, userSettings.notifications.notificationBodyEnabled, userSettings.notifications.notificationsEnabled]);

    // Desktop app: recolor the window controls to whatever is behind them after any theme or layout change.
    useEffect(() => {
        const frame = window.requestAnimationFrame(() => syncDesktopTitleBarColors());
        const timer = window.setTimeout(() => syncDesktopTitleBarColors(), 400); // after transitions settle
        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(timer);
        };
    }, [activeRoomId, hasOpenDialog, shouldRenderRightPanel, selectedSpaceId, userSettings.appearance]);
    useEffect(() => {
        const onResize = (): void => syncDesktopTitleBarColors();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Your polls with a time limit: when it's up, your app posts the results in the channel.
    useEffect(() => {
        closeExpiredPolls(client);
        const timer = window.setInterval(() => closeExpiredPolls(client), 15_000);
        return () => window.clearInterval(timer);
    }, [client]);

    useElementLikeNotifications({
        client,
        activeRoomId,
        hasOpenDialog,
        settings: userSettings.notifications,
        onOpenRoom: focusRoom,
    });

    // Sound style (Settings → Notifications) for the message sound, ringtone and call sounds.
    useEffect(() => setSoundStyle(userSettings.notifications.soundStyle), [userSettings.notifications.soundStyle]);

    // Uncaught errors go to Settings → Logs too.
    useEffect(() => captureGlobalErrors(), []);
    // Official badges (the owner's signed list), refreshed every few hours.
    useEffect(() => {
        void loadBadgeList();
        const timer = window.setInterval(() => void loadBadgeList(), 60 * 60 * 1000);
        return () => window.clearInterval(timer);
    }, []);

    // Bug reports (Settings → Report a bug): the sender leaves each report once the developer has joined it, and the
    // developer's account joins reports sent to it.
    useEffect(() => {
        let running = false;
        let again = false;
        const cleanUp = (): void => {
            if (running) {
                again = true; // a change arrived mid-run: go round once more
                return;
            }
            running = true;
            void cleanUpBugReportRooms(client).finally(() => {
                running = false;
                if (again) {
                    again = false;
                    cleanUp();
                }
            });
        };
        const onTimeline = (event: MatrixEvent, room: Room | undefined): void => {
            if (event.getType() === EventType.RoomMember && room && isBugReportRoom(room)) cleanUp();
        };
        const onRoom = (room: Room): void => {
            if (isBugReportRoom(room)) cleanUp();
        };
        cleanUp();
        client.on(RoomEvent.Timeline, onTimeline);
        client.on(ClientEvent.Room, onRoom);
        client.on(RoomEvent.MyMembership, onRoom);
        return () => {
            client.removeListener(RoomEvent.Timeline, onTimeline);
            client.removeListener(ClientEvent.Room, onRoom);
            client.removeListener(RoomEvent.MyMembership, onRoom);
        };
    }, [client]);

    // Desktop: the unread count as a bubble on the taskbar icon.
    useTaskbarBadge(client);

    // Other accounts signed in on this device: listed in the status menu, and their notifications still arrive.
    const storedAccounts = useStoredAccounts();
    useOtherAccountNotifications(client, userSettings.notifications.notificationsEnabled);
    // Arrived here by clicking another account's notification: open that conversation.
    useEffect(() => {
        const roomId = takePendingRoom();
        if (roomId) focusRoom(roomId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Right-click menus on servers in the rail and on channels (components/menus/roomMenus.ts).
    const reportError = (what: string) => (error: unknown) =>
        pushToast({ type: "error", message: `${what}: ${error instanceof Error ? error.message : String(error)}` });
    const leaveServer = async (space: Room, children: Room[]): Promise<void> => {
        if (!window.confirm(`Leave "${getRoomName(space)}"? You'll leave all of its channels too.`)) return;
        try {
            for (const room of children) if (room.getMyMembership() === "join") await client.leave(room.roomId).catch(() => undefined);
            await client.leave(space.roomId);
            if (selectedSpaceId === space.roomId) selectHome();
            pushToast({ type: "success", message: `Left ${getRoomName(space)}.` });
        } catch (error) {
            reportError("Couldn't leave the server")(error);
        }
    };
    const contextMenuRoom = contextMenu ? client.getRoom(contextMenu.roomId) : null;
    const contextMenuItems = (() => {
        if (!contextMenu || !contextMenuRoom) return null;
        const room = contextMenuRoom;
        if (contextMenu.kind === "space") {
            const children = getSpaceChannels(room, roomById);
            const order = spaces.map((space) => space.roomId);
            const index = order.indexOf(room.roomId);
            const view = getSpaceView(room.roomId);
            const setMode = (mode: RoomNotificationMode): void => {
                void setSpaceNotificationMode(client, room, children, mode).catch(reportError("Couldn't change notifications"));
            };
            return spaceMenuItems(
                {
                    hasUnread: spaceUnread.has(room.roomId),
                    canInvite: room.canInvite(ownUserId),
                    canManage: room.currentState.maySendStateEvent(EventType.SpaceChild, ownUserId),
                    muted: mutedRoomIds.has(room.roomId),
                    notificationMode: getSpaceNotificationMode(client, room.roomId),
                    hideMutedChannels: view.hideMutedChannels,
                    showAllChannels: view.showAllChannels,
                    canMoveUp: index > 0,
                    canMoveDown: index >= 0 && index < order.length - 1,
                },
                {
                    markRead: () => void markRoomsRead(client, [room, ...children]),
                    invite: () => openInviteDialogFor(room.roomId),
                    setMuted: (muted) => setMode(muted ? RoomNotificationMode.Mute : RoomNotificationMode.Default),
                    setNotificationMode: setMode,
                    setHideMutedChannels: (hide) => setSpaceView(room.roomId, { hideMutedChannels: hide }),
                    setShowAllChannels: (show) => setSpaceView(room.roomId, { showAllChannels: show }),
                    openPrivacySettings: () => openUserSettings("privacy"),
                    editServerProfile: () => setServerProfileSpaceId(room.roomId),
                    openServerSettings: () => {
                        selectServer(room.roomId);
                        setSettingsState({ mode: "server", tab: "overview" });
                    },
                    move: (to) => void saveSpaceOrder(client, movedSpaceOrder(order, room.roomId, to)).catch(reportError("Couldn't move the server")),
                    leave: () => void leaveServer(room, children),
                },
            );
        }
        return channelMenuItems(
            {
                hasUnread: getServerUnreadCount(room) > 0 || hasUnreadActivity(room, ownUserId),
                notificationMode: getRoomNotificationMode(client, room.roomId),
                canEdit: room.currentState.maySendStateEvent(EventType.RoomName, ownUserId),
            },
            {
                markRead: () => void markRoomsRead(client, [room]),
                setNotificationMode: (mode) => void setRoomNotificationMode(client, room.roomId, mode).catch(reportError("Couldn't change notifications")),
                copyLink: () => void navigator.clipboard?.writeText(`https://matrix.to/#/${encodeURIComponent(room.getCanonicalAlias() ?? room.roomId)}`),
                editChannel: () => openRoomSettingsFor(room.roomId),
            },
        );
    })();
    const serverProfileSpace = serverProfileSpaceId ? client.getRoom(serverProfileSpaceId) : null;

    return (
        <div className={appShellClassName} style={appShellStyle}>
            <aside className="left-rail">
                {/* Discord-style Home: the app icon opens Direct Messages and Group Chats. */}
                <button
                    type="button"
                    className={`rail-icon rail-home${selectedSpaceId === PEOPLE_SPACE_ID ? " is-active" : ""}`}
                    onClick={() => selectHome()}
                    title="Direct Messages"
                    aria-label="Direct Messages"
                    data-testid="rail-home"
                >
                    <img src={meadhallIcon} alt="" className="rail-home-icon" />
                </button>
                <div className="rail-divider" aria-hidden="true" />
                {spaces.map((space) => {
                    return (
                        <button
                            type="button"
                            key={space.roomId}
                            className={`rail-icon${selectedSpaceId === space.roomId ? " is-active" : ""}${spaceUnread.has(space.roomId) ? " has-unread" : ""}${mutedRoomIds.has(space.roomId) ? " is-muted" : ""}`}
                            onClick={() => selectServer(space.roomId)}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                setContextMenu({ kind: "space", roomId: space.roomId, x: event.clientX, y: event.clientY });
                            }}
                            title={getRoomName(space)}
                            data-space-id={space.roomId}
                        >
                            <RailSpaceIcon client={client} space={space} glyph={getSpaceGlyph(getRoomName(space))} />
                            {(spaceUnread.get(space.roomId)?.count ?? 0) > 0 ? (
                                <span className="rail-badge" data-testid="rail-badge">
                                    {spaceUnread.get(space.roomId)!.count > 99 ? "99+" : spaceUnread.get(space.roomId)!.count}
                                </span>
                            ) : null}
                        </button>
                    );
                })}
                <button
                    type="button"
                    className="rail-icon rail-create-space"
                    onClick={() => setCreateSpaceOpen(true)}
                    title="Create Space"
                    disabled={client.isGuest()}
                >
                    +
                </button>
            </aside>

            <section className="channels-pane">
                <div className="channels-pane-resize-handle" onPointerDown={handleResizePointerDown} />
                {selectedSpaceId === PEOPLE_SPACE_ID ? (
                    <HomeSidebar
                        client={client}
                        directRooms={peopleChannels}
                        otherRooms={homeGroupRooms}
                        bugReports={homeBugReports}
                        invites={homeInvites.filter((room) => !isBugReportRoom(room))}
                        onAcceptInvite={(roomId) => {
                            void requestJoinRoom(roomId, { preferredSpaceId: null })
                                .then(() => selectChannel(roomId))
                                .catch((joinError) => pushToast({ type: "error", message: describeJoinError(joinError, roomId) }));
                        }}
                        onDeclineInvite={(roomId) => {
                            void client.leave(roomId).catch((leaveError) => pushToast({ type: "error", message: `Couldn't decline: ${leaveError instanceof Error ? leaveError.message : String(leaveError)}` }));
                        }}
                        activeRoomId={activeRoomId}
                        roomCalls={roomCalls}
                        currentCallRoomId={hasActiveVoiceSession ? voiceSessionRoomId : null}
                        onSelectRoom={selectChannel}
                        onNewConversation={() => setCreateDirectChatOpen(true)}
                    />
                ) : (
                <>
                <div className="pane-top pane-top-row">
                    <span>{selectedSpaceName}</span>
                    <div className="pane-top-actions">
                        {selectedSpaceId === PEOPLE_SPACE_ID ? (
                            <button
                                type="button"
                                className="pane-top-action"
                                onClick={() => setCreateDirectChatOpen(true)}
                                title="Start direct chat"
                            >
                                New DM
                            </button>
                        ) : null}
                        {selectedSpaceRoom ? (
                            <button
                                type="button"
                                className="pane-top-action"
                                onClick={() => openServerSettings("overview")}
                                title="Open server settings"
                            >
                                Server
                            </button>
                        ) : null}
                    </div>
                </div>
                {selectedSpaceBannerUrl ? (
                    <div className="space-banner" data-testid="space-banner">
                        <MotionImage src={selectedSpaceBannerUrl} alt="" />
                    </div>
                ) : null}
                {showSpaceOnboarding ? (
                    <div className="space-onboarding-card">
                        <div className="space-onboarding-header">
                            <h3 className="space-onboarding-title">Space is ready</h3>
                            <button
                                type="button"
                                className="space-onboarding-dismiss"
                                aria-label="Dismiss onboarding"
                                onClick={() => setSpaceOnboardingSpaceId(null)}
                            >
                                x
                            </button>
                        </div>
                        <p className="space-onboarding-text">Create your first channel or configure the server.</p>
                        <div className="space-onboarding-actions">
                            <button
                                type="button"
                                className="room-dialog-button room-dialog-button-primary"
                                onClick={() => openCreateRoomDialog(selectedSpaceRoom?.roomId ?? null)}
                            >
                                Create channel
                            </button>
                            <button
                                type="button"
                                className="room-dialog-button room-dialog-button-secondary"
                                onClick={() => openServerSettings("overview")}
                            >
                                Open server settings
                            </button>
                            <button
                                type="button"
                                className="room-dialog-button room-dialog-button-secondary"
                                onClick={() => openInviteDialogFor(selectedSpaceRoom?.roomId ?? null)}
                            >
                                Invite members
                            </button>
                        </div>
                    </div>
                ) : null}
                <RoomList
                    client={client}
                    spaceId={selectedSpaceId}
                    rooms={listedChannels}
                    mutedRoomIds={mutedRoomIds}
                    onRoomContextMenu={(roomId, x, y) => setContextMenu({ kind: "channel", roomId, x, y })}
                    voiceChannelHintRoomIds={voiceChannelHintRoomIds}
                    voiceDiscoveryReady={voiceDiscoveryReady}
                    showRoomAvatars={selectedSpaceId === PEOPLE_SPACE_ID || userSettings.appearance.showSpaceChannelAvatars}
                    discoverableRooms={selectedSpaceId === PEOPLE_SPACE_ID || !selectedSpaceView.showAllChannels ? [] : discoverableSpaceChannels}
                    discoverableJoiningRoomId={joiningDiscoverableRoomId}
                    activeRoomId={activeRoomId}
                    orderingMode={selectedSpaceId === PEOPLE_SPACE_ID ? "dynamic" : "manual"}
                    showOrderingControls={selectedSpaceId !== PEOPLE_SPACE_ID}
                    showHashPrefix={selectedSpaceId !== PEOPLE_SPACE_ID}
                    onSelectRoom={selectChannel}
                    onJoinDiscoverableRoom={(roomId) => {
                        void joinDiscoverableSpaceChannel(roomId);
                    }}
                    localVoiceSession={
                        voiceSessionRoomId
                            ? {
                                  roomId: voiceSessionRoomId,
                                  status: voiceSessionStatus,
                                  userId: ownUserId || null,
                                  displayName: ownDisplayName,
                                  avatarMxc: ownAvatarMxc || null,
                                  micMuted: voiceSessionStatus === "connected" ? voiceControlState.micMuted : false,
                                  audioMuted: voiceSessionStatus === "connected" ? voiceControlState.audioMuted : false,
                              }
                            : null
                    }
                    liveSpeakingByRoomId={voiceSpeakingByRoomId}
                    liveScreenShareByRoomId={voiceScreenShareByRoomId}
                    liveParticipantsByRoomId={voiceParticipantsByRoomId}
                    liveParticipantsOverrideRoomId={liveVoiceParticipantsOverrideRoomId}
                    onOpenRoomSettings={openRoomSettingsFor}
                />
                </>
                )}
                <div className="pane-bottom">
                    {hasActiveVoiceSession && voiceSessionRoomId ? (
                        <div
                            className={`pane-voice-dock${
                                voiceSessionStatus === "connected"
                                    ? " is-connected"
                                    : voiceSessionStatus === "joining"
                                      ? " is-connecting"
                                      : ""
                            }`}
                        >
                            {/* Discord-style "Voice Connected" panel */}
                            <button
                                type="button"
                                className="pane-voice-pill"
                                onClick={() => openRoomAtBottom(voiceSessionRoomId)}
                                title="Open voice channel"
                            >
                                <span className="pane-voice-pill-title">
                                    {voiceSessionStatus === "joining"
                                        ? "Connecting…"
                                        : voiceSessionStatus === "connected"
                                          ? "Voice Connected"
                                          : "Voice Disconnected"}
                                </span>
                                <span className="pane-voice-pill-subtitle">
                                    {activeVoiceSessionRoom ? getRoomName(activeVoiceSessionRoom) : "Voice channel"}
                                </span>
                            </button>
                            {voiceSessionStatus === "disconnected" ? (
                                <button
                                    type="button"
                                    className="pane-voice-control pane-voice-control-join"
                                    onClick={joinVoiceFromDock}
                                >
                                    Join
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="pane-icon-button pane-voice-hangup"
                                    onClick={leaveVoiceFromDock}
                                    aria-label={voiceSessionStatus === "joining" ? "Cancel joining" : "Disconnect"}
                                    title={voiceSessionStatus === "joining" ? "Cancel" : "Disconnect"}
                                >
                                    <PixelIcon name="hangup" />
                                </button>
                            )}
                        </div>
                    ) : null}
                    {/* Discord-style user panel: profile plus mic, deafen and settings */}
                    <div className="pane-user-panel">
                        {statusMenuOpen ? (
                            <StatusMenu
                                status={ownStatus}
                                onChange={updateOwnStatus}
                                onOpenSettings={() => openUserSettings("my-account")}
                                onClose={() => setStatusMenuOpen(false)}
                                accounts={storedAccounts}
                                onSwitchAccount={(userId) => void switchAccount(client, userId)}
                                onAddAccount={() => void addAccount(client)}
                            />
                        ) : null}
                        <button
                            type="button"
                            className="pane-user-card"
                            onClick={() => setStatusMenuOpen((open) => !open)}
                            title="Set your status"
                            aria-haspopup="menu"
                            aria-expanded={statusMenuOpen}
                            data-testid="user-card"
                        >
                            <Avatar
                                className="pane-user-avatar"
                                name={ownDisplayName}
                                src={ownAvatarSources[0] ?? null}
                                sources={ownAvatarSources}
                                seed={ownUserId || undefined}
                                userId={ownUserId || undefined}
                                presenceState={ownStatusDot}
                            />
                            <span className="pane-user-meta">
                                <span className="pane-user-name">{ownDisplayName}</span>
                                <span className="pane-user-id" data-testid="own-status-text">
                                    {ownStatus.text || (activity && ownStatus.state !== "invisible" ? `Playing ${activity.name}` : ownUserId || "Unknown user")}
                                </span>
                            </span>
                        </button>
                        <button
                            type="button"
                            className={`pane-icon-button${selfVoice.muted ? " is-muted" : ""}`}
                            onClick={toggleVoiceMicFromDock}
                            aria-pressed={selfVoice.muted}
                            aria-label={selfVoice.muted ? "Unmute" : "Mute"}
                            title={selfVoice.muted ? "Unmute" : "Mute"}
                            data-testid="self-mute"
                        >
                            <PixelIcon name="mic" slashed={selfVoice.muted} />
                        </button>
                        <button
                            type="button"
                            className={`pane-icon-button${selfVoice.deafened ? " is-muted" : ""}`}
                            onClick={toggleVoiceAudioFromDock}
                            aria-pressed={selfVoice.deafened}
                            aria-label={selfVoice.deafened ? "Undeafen" : "Deafen"}
                            title={selfVoice.deafened ? "Undeafen" : "Deafen"}
                            data-testid="self-deafen"
                        >
                            <PixelIcon name="headphones" slashed={selfVoice.deafened} />
                        </button>
                        <button
                            type="button"
                            className="pane-icon-button"
                            onClick={() => openUserSettings("my-account")}
                            aria-label="User settings"
                            title="User settings"
                        >
                            <PixelIcon name="gear" />
                        </button>
                    </div>
                </div>
            </section>

            <section className="main-pane">
                <ChannelHeader
                    room={activeRoom}
                    isDirectMessage={Boolean(activeRoom && isActiveRoomDirect && isOneToOneRoom(activeRoom, ownUserId))}
                    subtitle={
                        activeRoom && selectedSpaceId === PEOPLE_SPACE_ID && !isOneToOneRoom(activeRoom, ownUserId)
                            ? `Group chat · ${activeRoom.getJoinedMemberCount()} members`
                            : undefined
                    }
                    onMobileBack={goBackToList}
                    inbox={{ count: inboxCount, open: inboxOpen, onToggle: () => setInboxOpen((open) => !open) }}
                    update={
                        desktopUpdates.status && (desktopUpdates.status.state === "available" || desktopUpdates.status.state === "downloaded")
                            ? {
                                  label:
                                      desktopUpdates.status.state === "downloaded"
                                          ? `Restart to update to Meadhall ${desktopUpdates.status.version}`
                                          : `Update to Meadhall ${desktopUpdates.status.version}`,
                                  onClick: desktopUpdates.updateNow,
                              }
                            : mobileUpdates.updateAvailable
                              ? { label: "A new version of Meadhall is out", onClick: () => openUserSettings("updates") }
                              : undefined
                    }
                    showHashPrefix={shouldPrefixRoomWithHash}
                    sidebarMode={isNarrowLayout && !narrowPanelOpen ? "closed" : rightSidebarMode}
                    searchQuery={sidebarSearchQuery}
                    canInviteInRoom={canInviteInActiveRoom}
                    onSearchQueryChange={setSidebarSearchQuery}
                    onSelectSidebarMode={selectSidebarMode}
                    onOpenDirectChat={() => setCreateDirectChatOpen(true)}
                    onOpenCreateRoom={() =>
                        openCreateRoomDialog(selectedSpaceId === PEOPLE_SPACE_ID ? null : selectedSpaceRoom?.roomId ?? null)
                    }
                    onOpenJoinRoom={() => setJoinRoomOpen(true)}
                    onOpenInviteUsers={() => openInviteDialogFor(activeRoom?.roomId ?? null)}
                    onOpenRoomSettings={() => openRoomSettingsFor(activeRoom?.roomId ?? null)}
                    onOpenModeration={() => setRoomModerationOpen(true)}
                    onCopyRoomLink={copyActiveRoomLink}
                    onLeaveRoom={leaveActiveRoom}
                    call={
                        isActiveRoomCallable && activeRoom
                            ? {
                                  inCall: isInActiveRoomCall,
                                  othersInCall: activeRoomCallOthers.length,
                                  onStartCall: () => startCallInRoom(activeRoom.roomId),
                              }
                            : undefined
                    }
                />
                <div className={`main-body${voiceChatBeside ? " has-voice-chat" : ""}${activeThread && (!shouldShowVoicePanel || voiceChatBeside) ? " has-thread" : ""}`}>
                {hasActiveVoiceSession && voiceSessionRoomId ? (
                    <div
                        className={`main-voice-slot${
                            shouldShowVoicePanel ? "" : shouldShowCallStrip ? " is-call-strip" : " voice-room-hidden"
                        }`}
                        aria-hidden={!shouldShowVoicePanel && !shouldShowCallStrip}
                    >
                        <VoiceRoom
                            ref={voiceRoomRef}
                            client={client}
                            matrixRoomId={voiceSessionRoomId}
                            matrixRoom={
                                activeRoom?.roomId === voiceSessionRoomId ? activeRoom : client.getRoom(voiceSessionRoomId) ?? undefined
                            }
                            audioSettings={userSettings.audio}
                            autoJoinNonce={voiceAutoJoinNonce}
                            onAudioSettingsChange={(audio) =>
                                setUserSettings((current) => ({
                                    ...current,
                                    audio,
                                }))
                            }
                            onSessionStateChange={(state) => {
                                setVoiceSessionRoomId(state.roomId);
                                setVoiceSessionStatus(state.status);
                                if (state.status === "joining") {
                                    setVoiceParticipantsByRoomId((current) => {
                                        const next = new Map(current);
                                        next.set(state.roomId, new Set<string>());
                                        return next;
                                    });
                                }
                            }}
                            announceCall={callAnnouncement(
                                activeVoiceSessionRoom
                                    ? {
                                          isVoiceChannel: isRoomVoiceChannel(activeVoiceSessionRoom),
                                          isHomeRoom: ringableRoomIds.has(activeVoiceSessionRoom.roomId),
                                          isOneToOne: isOneToOneRoom(activeVoiceSessionRoom, ownUserId),
                                      }
                                    : null,
                            )}
                            joinMuted={selfVoice.muted}
                            joinDeafened={selfVoice.deafened}
                            onControlsStateChange={handleVoiceControlsStateChange}
                            onLiveParticipantsChange={handleLiveParticipantsChange}
                        />
                    </div>
                ) : null}
                {!shouldShowVoicePanel || voiceChatBeside ? (
                    <div className="main-chat-stack" data-testid={voiceChatBeside ? "voice-channel-chat" : undefined}>
                        {isActiveRoomCallable && activeRoom && !isInActiveRoomCall && activeRoomCallOthers.length > 0 ? (
                            <div className="room-call-banner" role="status" data-testid="room-call-banner">
                                <PixelIcon name="phone" size={18} />
                                <span className="room-call-banner-text">
                                    <strong>Call in progress</strong>
                                    <span>
                                        {activeRoomCallOthers
                                            .map((userId) => activeRoom.getMember(userId)?.name ?? userId)
                                            .join(", ")}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    className="room-call-banner-join"
                                    onClick={() => startCallInRoom(activeRoom.roomId)}
                                >
                                    Join call
                                </button>
                            </div>
                        ) : null}
                        <Timeline
                            client={client}
                            room={activeRoom}
                            focusBottomNonce={timelineFocusBottomNonce}
                            replyToEventId={replyToEvent?.getId() ?? null}
                            onReply={(event) => {
                                setEditingEvent(null);
                                setReplyToEvent(event);
                            }}
                            onEdit={(event) => {
                                setReplyToEvent(null);
                                setEditingEvent(event);
                            }}
                            onSelectUser={selectUserAndOpenPanel}
                            activeSpaceId={selectedSpaceId === PEOPLE_SPACE_ID ? null : selectedSpaceId}
                            customReactionImagesEnabled={renderReactionImages}
                            showReadReceipts={shouldShowReadReceipts}
                            linkPreviews={userSettings.privacy.linkPreviews}
                            onOpenThread={(rootEventId) => activeRoom && setOpenThread({ roomId: activeRoom.roomId, rootEventId })}
                        />
                        <div className="main-chat-composer">
                            <Composer
                                client={client}
                                room={activeRoom}
                                activeSpaceId={selectedSpaceId === PEOPLE_SPACE_ID ? null : selectedSpaceId}
                                editingEvent={editingEvent}
                                onCancelEdit={() => setEditingEvent(null)}
                                replyToEvent={replyToEvent}
                                onCancelReply={() => setReplyToEvent(null)}
                            />
                        </div>
                    </div>
                ) : null}
                {activeThread && activeRoom && (!shouldShowVoicePanel || voiceChatBeside) ? (
                    <ThreadPanel
                        key={activeThread.rootEventId}
                        client={client}
                        room={activeRoom}
                        rootEventId={activeThread.rootEventId}
                        activeSpaceId={selectedSpaceId === PEOPLE_SPACE_ID ? null : selectedSpaceId}
                        customReactionImagesEnabled={renderReactionImages}
                        linkPreviews={userSettings.privacy.linkPreviews}
                        onSelectUser={selectUserAndOpenPanel}
                        onClose={closeThread}
                    />
                ) : null}
                </div>
            </section>

            {shouldRenderRightPanel ? (
                <RightPanel
                    client={client}
                    room={activeRoom}
                    activeSpaceRoom={selectedSpaceId === PEOPLE_SPACE_ID ? null : selectedSpaceRoom}
                    mode={panelMode}
                    roomMode={rightSidebarMode}
                    searchQuery={sidebarSearchQuery}
                    onSearchQueryChange={setSidebarSearchQuery}
                    onSelectUser={selectUserAndOpenPanel}
                    onBackToRoom={clearSelectedUser}
                    onOpenRoomSettings={() => openRoomSettingsFor(activeRoom?.roomId ?? null)}
                    onCopyRoomLink={copyActiveRoomLink}
                    onLeaveRoom={leaveActiveRoom}
                    onOpenRoom={focusRoom}
                    onToast={pushToast}
                    onCallUser={(userId) => void callUser(userId)}
                />
            ) : null}
            {emojiUploadOpen && emojiUploadTarget ? (
                <EmojiUploadDialog
                    client={client}
                    target={emojiUploadTarget}
                    open={emojiUploadOpen}
                    onClose={() => {
                        setEmojiUploadOpen(false);
                        setEmojiUploadTarget(null);
                    }}
                />
            ) : null}
            <CreateDirectChatDialog
                client={client}
                open={createDirectChatOpen}
                onClose={() => setCreateDirectChatOpen(false)}
                onResolved={({ roomId, created, isGroup, targetCount }) => {
                    setCreateDirectChatOpen(false);
                    focusRoom(roomId);
                    pushToast({
                        type: "success",
                        message: isGroup
                            ? created
                                ? `Group chat created (${targetCount} people).`
                                : "Group chat opened."
                            : created
                                ? "Direct message created."
                                : "Direct message opened.",
                    });
                }}
            />
            <CreateRoomDialog
                client={client}
                open={createRoomOpen}
                spaceParentId={createRoomParentSpaceId}
                onClose={() => {
                    setCreateRoomOpen(false);
                    setCreateRoomParentSpaceId(null);
                }}
                onCreated={(roomId) => {
                    setCreateRoomOpen(false);
                    const createdInSpaceId = createRoomParentSpaceId;
                    setCreateRoomParentSpaceId(null);
                    focusRoom(roomId);
                    if (createdInSpaceId && createdInSpaceId === spaceOnboardingSpaceId) {
                        setSpaceOnboardingSpaceId(null);
                    }
                    pushToast({
                        type: "success",
                        message: createdInSpaceId ? "Channel created in Space." : "Room created.",
                    });
                }}
            />
            <CreateSpaceDialog
                client={client}
                open={createSpaceOpen}
                onClose={() => setCreateSpaceOpen(false)}
                onCreated={(roomId) => {
                    setCreateSpaceOpen(false);
                    focusRoom(roomId);
                    setSpaceOnboardingSpaceId(roomId);
                    pushToast({ type: "success", message: "Space created." });
                }}
                onJoinPublicSpaceRequest={(target) => requestJoinRoom(target)}
                onJoined={() => {
                    setCreateSpaceOpen(false);
                    pushToast({ type: "success", message: "Joined public Space." });
                }}
                onImport={() => setImportJsonOpen(true)}
            />
            <JoinRoomDialog
                client={client}
                open={joinRoomOpen}
                onClose={() => setJoinRoomOpen(false)}
                onJoinRequest={(target) => requestJoinRoom(target)}
                onJoined={() => {
                    setJoinRoomOpen(false);
                    pushToast({ type: "success", message: "Joined room." });
                }}
            />
            <InviteDialog
                client={client}
                room={inviteTargetRoom}
                open={inviteOpen}
                onCompleted={({ invited, failed }) => {
                    if (invited.length > 0 && failed.length === 0) {
                        pushToast({
                            type: "success",
                            message: invited.length === 1 ? "User invited." : `${invited.length} users invited.`,
                        });
                        return;
                    }

                    if (invited.length > 0 && failed.length > 0) {
                        const firstFailure = failed[0];
                        pushToast({
                            type: "info",
                            message: `Invited ${invited.length}, failed ${failed.length} (${firstFailure.userId}: ${firstFailure.message}).`,
                        });
                    }
                }}
                onClose={() => {
                    setInviteOpen(false);
                    setInviteTargetRoomId(null);
                }}
            />
            <RoomSettingsDialog
                client={client}
                room={roomSettingsRoom}
                open={Boolean(roomSettingsRoomId)}
                onClose={() => setRoomSettingsRoomId(null)}
            />
            <RoomModerationDialog
                client={client}
                room={activeRoom}
                open={roomModerationOpen}
                onClose={() => setRoomModerationOpen(false)}
            />
            <SettingsOverlay
                open={Boolean(settingsState)}
                mode={settingsState?.mode ?? "user"}
                initialTab={settingsState?.tab ?? "my-account"}
                client={client}
                spaceRoom={settingsState?.mode === "server" ? selectedSpaceRoom : null}
                spaceChannels={channels}
                activeRoomId={activeRoomId}
                onSelectRoom={setActiveRoomId}
                onOpenEmojiUpload={(target) => {
                    setEmojiUploadTarget(target);
                    setEmojiUploadOpen(true);
                }}
                onOpenCreateRoomInSpace={(spaceId) => {
                    setSettingsState(null);
                    openCreateRoomDialog(spaceId);
                }}
                onRefreshSpaceChannels={reloadSpaceChannelsFromServer}
                onClose={() => setSettingsState(null)}
                onLeftSpace={(spaceId) => {
                    if (selectedSpaceId === spaceId) {
                        setSelectedSpaceId(PEOPLE_SPACE_ID);
                    }
                    setSettingsState(null);
                }}
                onLogout={onLogout}
                userSettings={userSettings}
                onUserSettingsChange={setUserSettings}
                renderReactionImages={renderReactionImages}
                onToggleRenderReactionImages={setRenderReactionImages}
                onToast={pushToast}
            />
            <ImportJsonWizard
                client={client}
                open={importJsonOpen}
                onClose={() => setImportJsonOpen(false)}
                onImported={(spaceId) => {
                    setImportJsonOpen(false);
                    focusRoom(spaceId);
                    pushToast({ type: "success", message: "Import completed." });
                }}
            />
            <Toast toast={toast} onClose={() => setToast(null)} />
            {/* Overlays come last: on desktop, later elements win over the title-bar drag strip, so anything drawn
                over it (the call card, banners) must follow the layout or its buttons would drag the window. */}
            <DesktopUpdateBanner />
            <MobileUpdateBanner onOpenUpdateSettings={() => openUserSettings("updates")} />
            <WhatsNewDialog />
            <CallEndedNotice onViewDetails={() => openUserSettings("logs")} />
            {inboxOpen ? (
                <InboxPanel
                    client={client}
                    rooms={visibleRooms}
                    isMuted={isMutedRoom}
                    describeRoom={describeInboxRoom}
                    onOpenRoom={(roomId, threadRootId) => {
                        setInboxOpen(false);
                        focusRoom(roomId);
                        if (threadRootId) setOpenThread({ roomId, rootEventId: threadRootId });
                    }}
                    onClose={() => setInboxOpen(false)}
                />
            ) : null}
            {contextMenu && contextMenuItems && contextMenuRoom ? (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={contextMenuItems}
                    label={contextMenu.kind === "space" ? `${getRoomName(contextMenuRoom)} menu` : `${getRoomName(contextMenuRoom)} channel menu`}
                    onClose={() => setContextMenu(null)}
                />
            ) : null}
            {serverProfileSpace ? (
                <ServerProfileDialog
                    client={client}
                    space={serverProfileSpace}
                    channels={getSpaceChannels(serverProfileSpace, roomById)}
                    onClose={() => setServerProfileSpaceId(null)}
                    onToast={pushToast}
                />
            ) : null}
            {incomingCall ? (
                <IncomingCallCard
                    client={client}
                    call={incomingCall}
                    speakerId={userSettings.audio.preferredAudioOutputId}
                    ringtone={{ enabled: userSettings.notifications.ringtoneEnabled, customDataUrl: userSettings.notifications.customRingtoneDataUrl }}
                    onJoin={() => {
                        const roomId = incomingCall.roomId;
                        focusRoom(roomId);
                        startCallInRoom(roomId);
                    }}
                    onDismiss={dismissIncomingCall}
                />
            ) : null}
        </div>
    );
}
