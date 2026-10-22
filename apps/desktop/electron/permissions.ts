// SPDX-License-Identifier: AGPL-3.0-only
import { session } from "electron";

// Deny every permission except what the app itself needs, and only for the app's own origin
// (embedded third-party frames get nothing).
// - media / notifications: voice and message alerts
// - clipboard-sanitized-write: navigator.clipboard.writeText (copy buttons, recovery keys)
// - fullscreen: screen-share stage fullscreen
const ALLOWED_PERMISSIONS = new Set(["media", "notifications", "clipboard-sanitized-write", "fullscreen"]);

export function configurePermissionHandlers(isAppUrl: (url: string) => boolean): void {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        const requestingUrl = details.requestingUrl || webContents.getURL();
        callback(ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingUrl));
    });

    session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
        return ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingOrigin);
    });
}
