// SPDX-License-Identifier: AGPL-3.0-only
// Shows notifications for the signed-in accounts that aren't active (checked every minute); clicking one switches
// to that account and opens the conversation.
import { useEffect, useRef } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { checkOtherAccounts, type OtherAccountNotification } from "../../core/accounts/otherAccountNotifications";
import { isDoNotDisturb } from "../presence/clientStatus";
import { switchAccount } from "./accountSwitching";

const CHECK_EVERY_MS = 60_000;
const FIRST_CHECK_MS = 5_000;
const CLICK_PREFIX = "account:";

export function useOtherAccountNotifications(client: MatrixClient, enabled: boolean): void {
    const clientRef = useRef(client);
    clientRef.current = client;

    // Desktop notifications come back through the main process with the "account:<user>|<room>" id they were sent with.
    useEffect(
        () =>
            window.heorotDesktop?.onNotificationClicked?.((id) => {
                if (!id.startsWith(CLICK_PREFIX)) return;
                const [userId, roomId] = id.slice(CLICK_PREFIX.length).split("|");
                void switchAccount(clientRef.current, userId, roomId);
            }),
        [],
    );

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        const show = (notification: OtherAccountNotification): void => {
            const desktopNotify = window.heorotDesktop?.showNotification;
            if (desktopNotify) {
                void desktopNotify({
                    title: notification.title,
                    body: notification.body,
                    roomId: `${CLICK_PREFIX}${notification.accountUserId}|${notification.roomId}`,
                });
                return;
            }
            if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
            const shown = new Notification(notification.title, { body: notification.body, tag: notification.eventId });
            shown.onclick = () => {
                window.focus();
                shown.close();
                void switchAccount(clientRef.current, notification.accountUserId, notification.roomId);
            };
        };
        const check = (): void => {
            void checkOtherAccounts().then((found) => {
                if (cancelled || isDoNotDisturb()) return;
                found.forEach(show);
            });
        };
        const first = window.setTimeout(check, FIRST_CHECK_MS);
        const timer = window.setInterval(check, CHECK_EVERY_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(first);
            window.clearInterval(timer);
        };
    }, [enabled]);
}
