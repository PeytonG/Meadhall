// SPDX-License-Identifier: AGPL-3.0-only
import type { MatrixClient } from "matrix-js-sdk/src/matrix";
import { describe, expect, it, vi } from "vitest";

import { isExpiredTokenError, withUploadTokenRefresh } from "../../../src/core/client/uploadTokenRefresh";

const expired = Object.assign(new Error("Access token has expired"), { httpStatus: 401, errcode: "M_UNKNOWN_TOKEN" });

function fakeClient(upload: ReturnType<typeof vi.fn>, refreshToken: string | null = "refresh") {
    return { uploadContent: upload, whoami: vi.fn().mockResolvedValue({ user_id: "@me:x" }), getRefreshToken: () => refreshToken };
}

describe("uploads with an expired access token", () => {
    it("refresh the token through a normal request and retry once", async () => {
        const upload = vi.fn().mockRejectedValueOnce(expired).mockResolvedValueOnce({ content_uri: "mxc://x/1" });
        const client = withUploadTokenRefresh(fakeClient(upload) as unknown as MatrixClient) as unknown as ReturnType<typeof fakeClient>;
        await expect(client.uploadContent(new Blob(["gif"]))).resolves.toEqual({ content_uri: "mxc://x/1" });
        expect(client.whoami).toHaveBeenCalledOnce();
        expect(upload).toHaveBeenCalledTimes(2);
    });

    it("don't retry other errors, a second expiry, or sessions without refresh tokens", async () => {
        const tooBig = Object.assign(new Error("Too large"), { httpStatus: 413, errcode: "M_TOO_LARGE" });
        const other = withUploadTokenRefresh(fakeClient(vi.fn().mockRejectedValue(tooBig)) as unknown as MatrixClient);
        await expect(other.uploadContent(new Blob(["x"]))).rejects.toBe(tooBig);

        const twice = vi.fn().mockRejectedValue(expired);
        const again = withUploadTokenRefresh(fakeClient(twice) as unknown as MatrixClient);
        await expect(again.uploadContent(new Blob(["x"]))).rejects.toBe(expired);
        expect(twice).toHaveBeenCalledTimes(2);

        const noRefresh = withUploadTokenRefresh(fakeClient(vi.fn().mockRejectedValue(expired), null) as unknown as MatrixClient);
        await expect(noRefresh.uploadContent(new Blob(["x"]))).rejects.toBe(expired);
    });

    it("recognises the expired-token error", () => {
        expect(isExpiredTokenError(expired)).toBe(true);
        expect(isExpiredTokenError({ httpStatus: 401, data: { errcode: "M_UNKNOWN_TOKEN", soft_logout: true } })).toBe(true);
        expect(isExpiredTokenError({ httpStatus: 403, errcode: "M_FORBIDDEN" })).toBe(false);
        expect(isExpiredTokenError(null)).toBe(false);
    });
});
