import { createClient } from "matrix-js-sdk/src/matrix";

import type { SessionLifecycle } from "../lifecycle/SessionLifecycle";
import type { MatrixCredentials } from "../types/credentials";

type UserIdentifier = { type: "m.id.user"; user: string };
type EmailIdentifier = { type: "m.id.thirdparty"; medium: "email"; address: string };
type PasswordIdentifier = UserIdentifier | EmailIdentifier;

export function normalizeHomeserverUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error("Homeserver URL is required.");
    }

    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    return parsed.toString().replace(/\/$/, "");
}

const DISCOVERY_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string): Promise<Response | null> {
    try {
        return await fetch(url, { signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
    } catch {
        return null;
    }
}

// Finds the homeserver's real client API address, as Element does, before signing in or registering.
// 1. `.well-known/matrix/client` on the entered address (handles "example.com" delegating to "matrix.example.com").
// 2. Otherwise `/_matrix/client/versions`, following redirects (handles "http://" on HTTPS-only servers).
// Without this, a redirected login request fails in the browser with "Failed to fetch": browsers don't follow
// redirects on CORS-preflighted requests such as the JSON login POST.
export async function resolveHomeserverBaseUrl(normalizedUrl: string): Promise<string> {
    const origin = new URL(normalizedUrl).origin;
    const wellKnown = await fetchWithTimeout(`${origin}/.well-known/matrix/client`);
    if (wellKnown?.ok) {
        try {
            const body = (await wellKnown.json()) as { "m.homeserver"?: { base_url?: unknown } };
            const baseUrl = body["m.homeserver"]?.base_url;
            if (typeof baseUrl === "string" && /^https?:\/\//i.test(baseUrl)) {
                return normalizeHomeserverUrl(baseUrl);
            }
        } catch {
            // Not JSON: fall through to the versions check.
        }
    }

    const versions = await fetchWithTimeout(`${normalizedUrl}/_matrix/client/versions`);
    if (versions?.ok && versions.url) {
        const finalUrl = new URL(versions.url);
        const basePath = finalUrl.pathname.replace(/\/_matrix\/client\/versions$/, "");
        return normalizeHomeserverUrl(`${finalUrl.origin}${basePath}`);
    }
    return normalizedUrl;
}

export function buildPasswordIdentifier(username: string): PasswordIdentifier {
    const trimmed = username.trim();
    const isEmail = trimmed.indexOf("@") > 0;

    if (isEmail) {
        return {
            type: "m.id.thirdparty",
            medium: "email",
            address: trimmed,
        };
    }

    return {
        type: "m.id.user",
        user: trimmed,
    };
}

export async function assertPasswordLoginSupported(
    homeserverUrl: string,
    identityServerUrl?: string,
): Promise<void> {
    const tempClient = createClient({
        baseUrl: homeserverUrl,
        idBaseUrl: identityServerUrl,
    });
    const payload = await tempClient.loginFlows();

    const flowTypes = new Set(
        (payload.flows ?? [])
            .map((flow) => (typeof flow.type === "string" ? flow.type : ""))
            .filter((value) => value.length > 0),
    );

    if (flowTypes.has("m.login.password")) {
        return;
    }

    if (flowTypes.has("m.login.sso") || flowTypes.has("m.login.cas")) {
        throw new Error("This homeserver requires SSO login. Password login is disabled.");
    }

    throw new Error("This homeserver does not support password login.");
}

export function shouldTryFallbackLogin(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const matrixError = error as {
        httpStatus?: unknown;
        statusCode?: unknown;
    };

    const status =
        typeof matrixError.httpStatus === "number"
            ? matrixError.httpStatus
            : typeof matrixError.statusCode === "number"
              ? matrixError.statusCode
              : null;

    return status === 403;
}

interface PasswordLoginOptions {
    session: SessionLifecycle;
    homeserverUrl: string;
    identityServerUrl?: string;
    username: string;
    password: string;
    initialDeviceDisplayName?: string;
}

export async function loginWithPasswordLikeElement(options: PasswordLoginOptions): Promise<MatrixCredentials> {
    const identifier = buildPasswordIdentifier(options.username);

    return options.session.loginWithPassword(
        options.homeserverUrl,
        identifier as UserIdentifier,
        options.password,
        options.identityServerUrl,
        options.initialDeviceDisplayName,
    );
}
