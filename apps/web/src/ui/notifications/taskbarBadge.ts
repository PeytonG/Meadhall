// SPDX-License-Identifier: AGPL-3.0-only
// Desktop taskbar badge, like Discord's: Meadhall's icon with a red bubble in the top-right corner showing how many
// notifications are waiting (1-9, then "9+"). Windows only offers overlay badges in the bottom-right corner, so the
// app draws the whole icon and the desktop app uses it as the window icon.
import { useEffect } from "react";
import { ClientEvent, NotificationCountType, RoomEvent, type MatrixClient } from "matrix-js-sdk/src/matrix";

import meadhallIcon from "../assets/meadhall-icon.png";
import { isSentBugReport } from "../../core/bugReport/bugReport";

export function badgeLabel(count: number): string {
    return count > 9 ? "9+" : String(count);
}

// Everything the server says to notify about (messages in DMs and groups, mentions), across joined rooms.
export function unreadNotificationTotal(client: MatrixClient): number {
    let total = 0;
    for (const room of client.getRooms().filter((candidate) => !isSentBugReport(candidate, client.getUserId()))) {
        if (room.getMyMembership() !== "join" || room.isSpaceRoom()) continue;
        total += room.getUnreadNotificationCount(NotificationCountType.Total) ?? 0;
    }
    return total;
}

let iconImage: Promise<HTMLImageElement> | null = null;

function loadIcon(): Promise<HTMLImageElement> {
    iconImage ??= new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("icon failed to load"));
        image.src = meadhallIcon;
    });
    return iconImage;
}

// The icon with the bubble, as a PNG data URL (64px, which Windows scales for the taskbar).
export async function drawBadgedIcon(count: number): Promise<string> {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d")!;
    context.drawImage(await loadIcon(), 0, 0, size, size);
    const label = badgeLabel(count);
    const radius = label.length > 1 ? 17 : 15;
    const centerX = size - radius;
    const centerY = radius;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = "#ed4245";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = "#14091f";
    context.stroke();
    context.fillStyle = "#ffffff";
    context.font = `bold ${label.length > 1 ? 17 : 21}px "Segoe UI", system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, centerX, centerY + 1);
    return canvas.toDataURL("image/png");
}

export function useTaskbarBadge(client: MatrixClient): void {
    useEffect(() => {
        const setBadge = window.heorotDesktop?.setUnreadBadge;
        if (!setBadge) return undefined;
        let shown = -1;
        let timer: number | null = null;
        const update = (): void => {
            if (timer !== null) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                timer = null;
                const count = unreadNotificationTotal(client);
                const key = Math.min(count, 10); // 10+ all look like "9+"
                if (key === shown) return;
                shown = key;
                if (count === 0) {
                    void setBadge({ count: 0, icon: null });
                    return;
                }
                void drawBadgedIcon(count)
                    .then((icon) => setBadge({ count, icon }))
                    .catch(() => setBadge({ count, icon: null }));
            }, 300);
        };
        update();
        client.on(RoomEvent.Receipt, update);
        client.on(RoomEvent.Timeline, update);
        client.on(ClientEvent.Sync, update);
        return () => {
            if (timer !== null) window.clearTimeout(timer);
            client.removeListener(RoomEvent.Receipt, update);
            client.removeListener(RoomEvent.Timeline, update);
            client.removeListener(ClientEvent.Sync, update);
            void setBadge({ count: 0, icon: null });
        };
    }, [client]);
}
