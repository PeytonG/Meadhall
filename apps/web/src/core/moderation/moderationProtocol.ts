// SPDX-License-Identifier: AGPL-3.0-only
// Reports and moderation in servers (spaces): the data, as pure parsers and builders.
//
// - Report reasons: chosen by the server's owner (space state REPORT_REASONS_EVENT).
// - A report is its own small private room (creation type REPORT_ROOM_TYPE) made by the reporter, with the
//   server's moderators invited: only they and the reporter see it. Its details are state (REPORT_EVENT), and a
//   moderator's decision is REPORT_STATUS_EVENT.
// - Sanctions (timed bans, mutes, shadow mutes) are space state per person (SANCTION_EVENT, state key "user:" +
//   their user ID), so every Meadhall in the server can apply them (shadow mutes hide messages) and lift them when they end.
// - The moderation log, everyone's record, is a moderators-only room (MODLOG_ROOM_TYPE, found through
//   MOD_ROOM_EVENT) holding one MOD_ACTION_EVENT per action.

export const REPORT_REASONS_EVENT = "io.github.peytong.meadhall.report_reasons";
export const SANCTION_EVENT = "io.github.peytong.meadhall.sanction";
export const MOD_ROOM_EVENT = "io.github.peytong.meadhall.moderation_room";
export const REPORT_ROOM_TYPE = "io.github.peytong.meadhall.report";
export const REPORT_EVENT = "io.github.peytong.meadhall.report";
export const REPORT_STATUS_EVENT = "io.github.peytong.meadhall.report_status";
export const MODLOG_ROOM_TYPE = "io.github.peytong.meadhall.modlog";
export const MOD_ACTION_EVENT = "io.github.peytong.meadhall.mod_action";

export interface ReportReason {
    id: string;
    label: string;
}

export const DEFAULT_REPORT_REASONS: ReportReason[] = [
    { id: "spam", label: "Spam or unauthorized self-promotion" },
    { id: "language", label: "Curse words or offensive language" },
    { id: "harassment", label: "Harassment or hate" },
    { id: "nsfw", label: "NSFW or graphic content" },
    { id: "other", label: "Something else" },
];

const MAX_REASONS = 20;
const MAX_TEXT = 500;

export function cleanText(value: unknown, max = MAX_TEXT): string {
    return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max) : "";
}

const USER_ID = /^@[^:\s]+:[^\s]+$/;
// Room IDs: "!opaque:server", or just "!opaque" from room version 12 on.
const ROOM_ID = /^![^\s/]+$/;
const EVENT_ID = /^\$[^\s]+$/;

export function parseReportReasons(content: unknown): ReportReason[] {
    const reasons = (content as { reasons?: unknown } | null)?.reasons;
    if (!Array.isArray(reasons)) return DEFAULT_REPORT_REASONS;
    const parsed = reasons
        .map((reason) => ({ id: cleanText((reason as ReportReason)?.id, 40), label: cleanText((reason as ReportReason)?.label, 80) }))
        .filter((reason) => reason.id && reason.label)
        .slice(0, MAX_REASONS);
    return parsed.length ? parsed : DEFAULT_REPORT_REASONS;
}

// Labels in, reasons out (ids from the labels, kept unique).
export function reasonsFromLabels(labels: string[]): ReportReason[] {
    const used = new Set<string>();
    return labels
        .map((label) => cleanText(label, 80))
        .filter(Boolean)
        .slice(0, MAX_REASONS)
        .map((label) => {
            const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "reason";
            let id = base;
            for (let index = 2; used.has(id); index += 1) id = `${base}-${index}`;
            used.add(id);
            return { id, label };
        });
}

export interface ReportDetails {
    space: string;
    reportedUser: string;
    reasonId: string;
    reason: string;
    note: string;
    // The message reported, if it was a message.
    roomId?: string;
    eventId?: string;
    excerpt?: string;
}

export function reportContent(details: ReportDetails): Record<string, unknown> {
    return {
        space: details.space,
        reported_user: details.reportedUser,
        reason_id: cleanText(details.reasonId, 40),
        reason: cleanText(details.reason, 80),
        note: cleanText(details.note),
        ...(details.roomId && ROOM_ID.test(details.roomId) ? { room_id: details.roomId } : {}),
        ...(details.eventId && EVENT_ID.test(details.eventId) ? { event_id: details.eventId } : {}),
        ...(details.excerpt ? { excerpt: cleanText(details.excerpt, 1000) } : {}),
    };
}

export function parseReport(content: unknown): ReportDetails | null {
    const record = (content ?? {}) as Record<string, unknown>;
    const space = typeof record.space === "string" && ROOM_ID.test(record.space) ? record.space : null;
    const reportedUser = typeof record.reported_user === "string" && USER_ID.test(record.reported_user) ? record.reported_user : null;
    if (!space || !reportedUser) return null;
    return {
        space,
        reportedUser,
        reasonId: cleanText(record.reason_id, 40),
        reason: cleanText(record.reason, 80) || "No reason given",
        note: cleanText(record.note),
        ...(typeof record.room_id === "string" && ROOM_ID.test(record.room_id) ? { roomId: record.room_id } : {}),
        ...(typeof record.event_id === "string" && EVENT_ID.test(record.event_id) ? { eventId: record.event_id } : {}),
        ...(typeof record.excerpt === "string" ? { excerpt: cleanText(record.excerpt, 1000) } : {}),
    };
}

export type ModAction = "warn" | "kick" | "ban" | "timed_ban" | "unban" | "mute" | "unmute" | "shadow_mute" | "unshadow" | "dismiss";

export const MOD_ACTION_LABELS: Record<ModAction, string> = {
    warn: "Warned",
    kick: "Kicked",
    ban: "Banned",
    timed_ban: "Banned for a time",
    unban: "Unbanned",
    mute: "Muted for a time",
    unmute: "Unmuted",
    shadow_mute: "Shadow muted",
    unshadow: "Shadow mute lifted",
    dismiss: "Report dismissed",
};

export interface ModLogEntry {
    user: string;
    action: ModAction;
    reason: string;
    by: string;
    at: number;
    until?: number;
}

export function modActionContent(entry: Omit<ModLogEntry, "by" | "at">): Record<string, unknown> {
    return {
        user: entry.user,
        action: entry.action,
        reason: cleanText(entry.reason, 200),
        ...(entry.until ? { until: entry.until } : {}),
    };
}

export function parseModAction(content: unknown, sender: string, ts: number): ModLogEntry | null {
    const record = (content ?? {}) as Record<string, unknown>;
    const user = typeof record.user === "string" && USER_ID.test(record.user) ? record.user : null;
    const action = typeof record.action === "string" && record.action in MOD_ACTION_LABELS ? (record.action as ModAction) : null;
    if (!user || !action) return null;
    return {
        user,
        action,
        reason: cleanText(record.reason, 200),
        by: sender,
        at: ts,
        ...(typeof record.until === "number" && Number.isFinite(record.until) ? { until: record.until } : {}),
    };
}

export interface Sanction {
    banUntil?: number;
    muteUntil?: number;
    shadow?: boolean;
    // Each channel's power level for them before the mute (restored when it ends; null = they had none set).
    mutedLevels?: Record<string, number | null>;
}

// The state key for someone's sanction. Not their bare user ID: homeservers only let a person set state keyed by
// their own ID.
export function sanctionKey(userId: string): string {
    return `user:${userId}`;
}

export function userFromSanctionKey(key: string): string | null {
    const userId = key.startsWith("user:") ? key.slice("user:".length) : "";
    return USER_ID.test(userId) ? userId : null;
}

export function parseSanction(content: unknown): Sanction {
    const record = (content ?? {}) as Record<string, unknown>;
    const out: Sanction = {};
    if (typeof record.ban_until === "number" && Number.isFinite(record.ban_until)) out.banUntil = record.ban_until;
    if (typeof record.mute_until === "number" && Number.isFinite(record.mute_until)) out.muteUntil = record.mute_until;
    if (record.shadow === true) out.shadow = true;
    if (record.muted_levels && typeof record.muted_levels === "object") {
        const levels: Record<string, number | null> = {};
        for (const [roomId, level] of Object.entries(record.muted_levels as Record<string, unknown>)) {
            if (ROOM_ID.test(roomId) && (level === null || (typeof level === "number" && Number.isFinite(level)))) levels[roomId] = level as number | null;
        }
        out.mutedLevels = levels;
    }
    return out;
}

export function sanctionContent(sanction: Sanction): Record<string, unknown> {
    return {
        ...(sanction.banUntil ? { ban_until: sanction.banUntil } : {}),
        ...(sanction.muteUntil ? { mute_until: sanction.muteUntil } : {}),
        ...(sanction.shadow ? { shadow: true } : {}),
        ...(sanction.mutedLevels && Object.keys(sanction.mutedLevels).length ? { muted_levels: sanction.mutedLevels } : {}),
    };
}

// What has run out by `now` (and should be lifted).
export function expiredParts(sanction: Sanction, now = Date.now()): { ban: boolean; mute: boolean } {
    return {
        ban: sanction.banUntil !== undefined && sanction.banUntil <= now,
        mute: sanction.muteUntil !== undefined && sanction.muteUntil <= now,
    };
}

export const DURATIONS: Array<{ label: string; ms: number }> = [
    { label: "10 minutes", ms: 10 * 60_000 },
    { label: "1 hour", ms: 60 * 60_000 },
    { label: "1 day", ms: 24 * 60 * 60_000 },
    { label: "1 week", ms: 7 * 24 * 60 * 60_000 },
    { label: "30 days", ms: 30 * 24 * 60 * 60_000 },
];
