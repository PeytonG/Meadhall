// SPDX-License-Identifier: AGPL-3.0-only
// Uploads with an expired access token. In browsers matrix-js-sdk uploads with XMLHttpRequest (for progress), which
// skips the automatic token refresh other requests get, so with short-lived tokens (Synapse: about 5 minutes) any
// upload after a quiet spell failed with "401 Access token has expired" (pictures, GIFs, sounds, banners...).
// On that error we make one ordinary request, which refreshes the token, then retry the upload once.
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

export function isExpiredTokenError(error: unknown): boolean {
    const record = error as { httpStatus?: unknown; errcode?: unknown; data?: { errcode?: unknown; soft_logout?: unknown } } | null;
    if (!record || record.httpStatus !== 401) return false;
    const errcode = record.errcode ?? record.data?.errcode;
    return errcode === "M_UNKNOWN_TOKEN";
}

export function withUploadTokenRefresh(client: MatrixClient): MatrixClient {
    const upload = client.uploadContent.bind(client);
    client.uploadContent = (async (...args: Parameters<MatrixClient["uploadContent"]>) => {
        try {
            return await upload(...args);
        } catch (error) {
            if (!isExpiredTokenError(error) || !client.getRefreshToken()) throw error;
            // Any authenticated request goes through the SDK's refresh-and-retry, leaving the client a fresh token.
            await client.whoami();
            return upload(...args);
        }
    }) as MatrixClient["uploadContent"];
    return client;
}
