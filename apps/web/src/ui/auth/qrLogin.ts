// SPDX-License-Identifier: AGPL-3.0-only
// Sign in with a QR code: a signed-in device asks the homeserver for a short-lived, single-use login token
// (Matrix "login/get_token", after you re-enter your password) and shows it as a QR code; the new device scans it
// and signs in with m.login.token. The server must allow it (Synapse: login_via_existing_session.enabled).
//
// The QR code is as good as your password for a few minutes (until it's used or expires): only scan it with your
// own device, and don't show it on a stream.
import { createClient, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { wantsRefreshTokens } from "../../core/platform/android";
import type { MatrixCredentials } from "../../core/types/credentials";

const PREFIX = "meadhall-login:1?";

export interface QrLoginPayload {
    homeserver: string;
    token: string;
}

export function encodeQrPayload(payload: QrLoginPayload): string {
    return PREFIX + new URLSearchParams({ hs: payload.homeserver, t: payload.token }).toString();
}

// Only http(s) homeservers and token-like strings: a QR code from anywhere else is refused.
export function parseQrPayload(text: string): QrLoginPayload | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith(PREFIX) || trimmed.length > 2048) return null;
    const params = new URLSearchParams(trimmed.slice(PREFIX.length));
    const homeserver = params.get("hs") ?? "";
    const token = params.get("t") ?? "";
    let url: URL;
    try {
        url = new URL(homeserver);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (!/^[A-Za-z0-9._~+/=-]{8,512}$/.test(token)) return null;
    return { homeserver: url.origin + url.pathname.replace(/\/$/, ""), token };
}

export async function serverAllowsQrLogin(client: MatrixClient): Promise<boolean> {
    try {
        const capabilities = (await client.getCapabilities()) as Record<string, { enabled?: boolean } | undefined>;
        return capabilities["m.get_login_token"]?.enabled === true;
    } catch {
        return false;
    }
}

interface UiaError {
    httpStatus?: number;
    data?: { session?: unknown; flows?: Array<{ stages?: unknown }> };
}

export async function makeLoginToken(client: MatrixClient, password: string): Promise<{ token: string; expiresAt: number }> {
    const userId = client.getSafeUserId();
    let response: { login_token: string; expires_in_ms?: number };
    try {
        response = (await client.requestLoginToken()) as typeof response;
    } catch (error) {
        const uia = error as UiaError;
        const session = typeof uia.data?.session === "string" ? uia.data.session : null;
        if (uia.httpStatus !== 401 || !session) throw error;
        const passwordAllowed = (uia.data?.flows ?? []).some((flow) => Array.isArray(flow.stages) && flow.stages.includes("m.login.password"));
        if (!passwordAllowed) throw new Error("Your homeserver needs a sign-in step Meadhall can't do here.");
        response = (await client.requestLoginToken({ type: "m.login.password", identifier: { type: "m.id.user", user: userId }, password, session } as never)) as typeof response;
    }
    if (!response?.login_token) throw new Error("The homeserver didn't give a sign-in code.");
    return { token: response.login_token, expiresAt: Date.now() + (response.expires_in_ms ?? 120_000) };
}

export async function loginWithQrPayload(payload: QrLoginPayload, deviceDisplayName?: string): Promise<MatrixCredentials> {
    const response = await createClient({ baseUrl: payload.homeserver }).loginRequest({
        type: "m.login.token",
        token: payload.token,
        initial_device_display_name: deviceDisplayName,
        refresh_token: wantsRefreshTokens(),
    });
    return {
        homeserverUrl: payload.homeserver,
        userId: response.user_id,
        deviceId: response.device_id,
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        guest: false,
    };
}

// Reads a QR code from a camera frame: the browser's own detector where there is one (Android, macOS), jsQR otherwise.
type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

export async function readQrFromVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<string | null> {
    if (!video.videoWidth || !video.videoHeight) return null;
    const Native = (globalThis as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
    if (Native) {
        try {
            const found = await new Native({ formats: ["qr_code"] }).detect(video);
            if (found[0]?.rawValue) return found[0].rawValue;
            return null;
        } catch {
            // Fall through to jsQR.
        }
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { default: jsQR } = await import("jsqr");
    return jsQR(image.data, image.width, image.height)?.data ?? null;
}
