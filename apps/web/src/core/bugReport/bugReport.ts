// SPDX-License-Identifier: AGPL-3.0-only
// "Report a bug" (Settings): sends the report as a Matrix message from the reporter's own account to the developer.
//
// The developer's account is never shown to the reporter. The report goes into a fresh room marked with
// BUG_REPORT_ROOM_TYPE, which Meadhall hides from the room list. Once the developer has joined it (or after
// BUG_REPORT_ROOM_MAX_AGE_MS), the reporter's client leaves and forgets it. The room can't be left straight away: the
// developer's server can only join it through a server that is still in it.
import { MsgType, Preset, Visibility, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import type { CoreConfig } from "../config/configTypes";

export const BUG_REPORT_ROOM_TYPE = "io.github.peytong.meadhall.bug_report";
export const DEFAULT_BUG_REPORT_RECIPIENT = "@peytongna:elementprojectzkypg.duckdns.org";
export const BUG_REPORT_ROOM_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const BUG_REPORT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const BUG_REPORT_MAX_DESCRIPTION = 4000;
const RATE_LIMIT_KEY = "meadhall.bug_reports.v1";
const RATE_LIMIT_PER_HOUR = 3;

export const BUG_CATEGORIES = [
    "Calls & voice",
    "Screen sharing",
    "Messages & chat",
    "Notifications",
    "Sign-in & verification",
    "Updates & installing",
    "Appearance & layout",
    "Crash or freeze",
    "Other",
] as const;
export type BugCategory = (typeof BUG_CATEGORIES)[number];

export interface BugReport {
    category: BugCategory;
    description: string;
    image?: File | null;
    // App version, platform and (if the reporter chose to include them) recent logs.
    details?: string;
}

// Forks point this at their own account with `bug_report_recipient` in config.json.
export function getBugReportRecipient(config: CoreConfig | null | undefined): string {
    const configured = typeof config?.bug_report_recipient === "string" ? config.bug_report_recipient.trim() : "";
    return /^@[^:\s]+:\S+$/.test(configured) ? configured : DEFAULT_BUG_REPORT_RECIPIENT;
}

export function isBugReportRoom(room: Room): boolean {
    try {
        return room.getType() === BUG_REPORT_ROOM_TYPE;
    } catch {
        return false;
    }
}

// A report this account sent: hidden from the sender, who leaves it once it's delivered. Reports others sent to
// this account (the developer's) are listed under Home → Bug reports instead.
export function isSentBugReport(room: Room, ownUserId: string | null): boolean {
    return isBugReportRoom(room) && room.currentState.getStateEvents("m.room.create", "")?.getSender() === ownUserId;
}

export function isReceivedBugReport(room: Room, ownUserId: string | null): boolean {
    return isBugReportRoom(room) && !isSentBugReport(room, ownUserId);
}

function recentReports(): number[] {
    try {
        const stamps = JSON.parse(window.localStorage.getItem(RATE_LIMIT_KEY) ?? "[]") as unknown;
        const hourAgo = Date.now() - 60 * 60 * 1000;
        return Array.isArray(stamps) ? stamps.filter((stamp): stamp is number => typeof stamp === "number" && stamp > hourAgo) : [];
    } catch {
        return [];
    }
}

export function canSendBugReport(): boolean {
    return recentReports().length < RATE_LIMIT_PER_HOUR;
}

function noteReportSent(): void {
    try {
        window.localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify([...recentReports(), Date.now()]));
    } catch {
        // Not remembered; only the local rate limit is affected.
    }
}

export function formatBugReport(report: BugReport): string {
    return [
        "🐞 Meadhall bug report",
        `Category: ${report.category}`,
        "",
        report.description.trim().slice(0, BUG_REPORT_MAX_DESCRIPTION),
        ...(report.details?.trim() ? ["", report.details.trim()] : []),
    ].join("\n");
}

async function leaveAndForget(client: MatrixClient, roomId: string): Promise<void> {
    await client.leave(roomId).catch(() => undefined);
    await client.forget(roomId).catch(() => undefined);
}

export async function sendBugReport(client: MatrixClient, recipient: string, report: BugReport): Promise<void> {
    if (!report.description.trim()) throw new Error("Describe the problem first.");
    if (!canSendBugReport()) throw new Error("You've sent a few reports already. Try again in an hour.");
    if (report.image && (!report.image.type.startsWith("image/") || report.image.size > BUG_REPORT_MAX_IMAGE_BYTES)) {
        throw new Error("The screenshot must be an image of 8 MB or less.");
    }

    // Unencrypted: the developer may only open it long after the reporter's devices are gone.
    const { room_id: roomId } = await client.createRoom({
        name: "Meadhall bug report",
        preset: Preset.PrivateChat,
        visibility: Visibility.Private,
        creation_content: { type: BUG_REPORT_ROOM_TYPE },
    });
    try {
        await client.invite(roomId, recipient);
    } catch {
        await leaveAndForget(client, roomId);
        throw new Error("Couldn't reach the developer's server. Check your connection and try again.");
    }
    try {
        await client.sendMessage(roomId, { msgtype: MsgType.Text, body: formatBugReport(report) });
        if (report.image) {
            const { content_uri: url } = await client.uploadContent(report.image, { type: report.image.type, name: report.image.name });
            await client.sendMessage(roomId, {
                msgtype: MsgType.Image,
                body: report.image.name || "screenshot",
                url,
                info: { mimetype: report.image.type, size: report.image.size },
            });
        }
    } catch (error) {
        await leaveAndForget(client, roomId);
        throw error;
    }
    noteReportSent();
}

// Leaves and forgets reports this account sent once the developer has joined them (or they're too old), and forgets
// ones already left. The developer joins reports sent to them automatically.
export async function cleanUpBugReportRooms(client: MatrixClient): Promise<void> {
    const ownUserId = client.getUserId();
    for (const room of client.getRooms()) {
        if (isReceivedBugReport(room, ownUserId) && room.getMyMembership() === "invite") {
            await client.joinRoom(room.roomId).catch(() => undefined);
            continue;
        }
        if (!isSentBugReport(room, ownUserId)) continue;
        const membership = room.getMyMembership();
        if (membership === "leave" || membership === "ban") {
            await client.forget(room.roomId).catch(() => undefined);
            continue;
        }
        if (membership !== "join") continue;
        const created = room.currentState.getStateEvents("m.room.create", "")?.getTs() ?? Date.now();
        const delivered = room.getJoinedMembers().some((member) => member.userId !== ownUserId);
        if (delivered || Date.now() - created > BUG_REPORT_ROOM_MAX_AGE_MS) {
            await leaveAndForget(client, room.roomId);
        }
    }
}
