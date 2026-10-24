// SPDX-License-Identifier: AGPL-3.0-only
// What the right-click menus on a server (space) and on a channel contain, like Discord's.
import { RoomNotificationMode } from "../../notifications/roomActions";
import type { ContextMenuItem } from "./ContextMenu";

export interface SpaceMenuState {
    hasUnread: boolean;
    canInvite: boolean;
    canManage: boolean;
    muted: boolean;
    notificationMode: RoomNotificationMode;
    hideMutedChannels: boolean;
    showAllChannels: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

export interface SpaceMenuActions {
    markRead: () => void;
    invite: () => void;
    setMuted: (muted: boolean) => void;
    setNotificationMode: (mode: RoomNotificationMode) => void;
    setHideMutedChannels: (hide: boolean) => void;
    setShowAllChannels: (show: boolean) => void;
    openPrivacySettings: () => void;
    editServerProfile: () => void;
    openServerSettings: () => void;
    move: (to: "top" | "up" | "down" | "bottom") => void;
    leave: () => void;
}

function notificationItems(current: RoomNotificationMode, set: (mode: RoomNotificationMode) => void, defaultLabel: string): ContextMenuItem[] {
    return [
        { label: "All messages", checked: current === RoomNotificationMode.AllMessages, onSelect: () => set(RoomNotificationMode.AllMessages) },
        { label: "Only @mentions", checked: current === RoomNotificationMode.MentionsOnly, onSelect: () => set(RoomNotificationMode.MentionsOnly) },
        { label: "Nothing", checked: current === RoomNotificationMode.Mute, onSelect: () => set(RoomNotificationMode.Mute) },
        { label: defaultLabel, checked: current === RoomNotificationMode.Default, onSelect: () => set(RoomNotificationMode.Default) },
    ];
}

export function spaceMenuItems(state: SpaceMenuState, actions: SpaceMenuActions): ContextMenuItem[] {
    return [
        { label: "Mark as read", disabled: !state.hasUnread, onSelect: actions.markRead, testId: "space-menu-mark-read" },
        { kind: "separator" },
        { label: "Invite to server", disabled: !state.canInvite, onSelect: actions.invite },
        { kind: "separator" },
        state.muted
            ? { label: "Unmute server", onSelect: () => actions.setMuted(false), testId: "space-menu-mute" }
            : { label: "Mute server", hint: "No notifications or unread counts", onSelect: () => actions.setMuted(true), testId: "space-menu-mute" },
        {
            label: "Notification settings",
            hint: notificationLabel(state.notificationMode, "Default"),
            submenu: notificationItems(state.notificationMode, actions.setNotificationMode, "Default (each channel's own)"),
        },
        { label: "Hide muted channels", checked: state.hideMutedChannels, onSelect: () => actions.setHideMutedChannels(!state.hideMutedChannels) },
        { label: "Show all channels", hint: "Including ones you haven't joined", checked: state.showAllChannels, onSelect: () => actions.setShowAllChannels(!state.showAllChannels) },
        { kind: "separator" },
        { label: "Privacy settings", onSelect: actions.openPrivacySettings },
        { label: "Edit per-server profile", onSelect: actions.editServerProfile, testId: "space-menu-profile" },
        ...(state.canManage ? [{ label: "Server settings", onSelect: actions.openServerSettings } as ContextMenuItem] : []),
        { kind: "separator" },
        {
            label: "Move to...",
            submenu: [
                { label: "Top", disabled: !state.canMoveUp, onSelect: () => actions.move("top") },
                { label: "Up", disabled: !state.canMoveUp, onSelect: () => actions.move("up") },
                { label: "Down", disabled: !state.canMoveDown, onSelect: () => actions.move("down") },
                { label: "Bottom", disabled: !state.canMoveDown, onSelect: () => actions.move("bottom") },
            ],
        },
        { kind: "separator" },
        { label: "Leave server", danger: true, onSelect: actions.leave, testId: "space-menu-leave" },
    ];
}

export interface ChannelMenuState {
    hasUnread: boolean;
    notificationMode: RoomNotificationMode;
    canEdit: boolean;
}

export interface ChannelMenuActions {
    markRead: () => void;
    setNotificationMode: (mode: RoomNotificationMode) => void;
    copyLink: () => void;
    editChannel: () => void;
}

export function channelMenuItems(state: ChannelMenuState, actions: ChannelMenuActions): ContextMenuItem[] {
    const muted = state.notificationMode === RoomNotificationMode.Mute;
    return [
        { label: "Mark as read", disabled: !state.hasUnread, onSelect: actions.markRead },
        { kind: "separator" },
        muted
            ? { label: "Unmute channel", onSelect: () => actions.setNotificationMode(RoomNotificationMode.Default), testId: "channel-menu-mute" }
            : { label: "Mute channel", onSelect: () => actions.setNotificationMode(RoomNotificationMode.Mute), testId: "channel-menu-mute" },
        {
            label: "Notification settings",
            hint: notificationLabel(state.notificationMode, "Server default"),
            submenu: notificationItems(state.notificationMode, actions.setNotificationMode, "Use server default"),
        },
        { kind: "separator" },
        { label: "Copy link", onSelect: actions.copyLink },
        ...(state.canEdit ? [{ label: "Edit channel", onSelect: actions.editChannel } as ContextMenuItem] : []),
    ];
}

function notificationLabel(mode: RoomNotificationMode, defaultLabel: string): string {
    switch (mode) {
        case RoomNotificationMode.AllMessages:
            return "All messages";
        case RoomNotificationMode.MentionsOnly:
            return "Only @mentions";
        case RoomNotificationMode.Mute:
            return "Nothing";
        default:
            return defaultLabel;
    }
}
