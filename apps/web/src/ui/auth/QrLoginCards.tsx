// SPDX-License-Identifier: AGPL-3.0-only
// Sign in with a QR code (see qrLogin.ts): show one (Settings → Devices) and scan one (the sign-in screen).
import React, { useEffect, useRef, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import type { MatrixCredentials } from "../../core/types/credentials";
import { encodeQrPayload, loginWithQrPayload, makeLoginToken, parseQrPayload, readQrFromVideo, serverAllowsQrLogin } from "./qrLogin";

export function ShowLoginQrCard({ client }: { client: MatrixClient }): React.ReactElement | null {
    const [supported, setSupported] = useState<boolean | null>(null);
    const [asking, setAsking] = useState(false);
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [code, setCode] = useState<{ payload: string; expiresAt: number } | null>(null);
    const [now, setNow] = useState(Date.now());
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        void serverAllowsQrLogin(client).then((allowed) => {
            if (!cancelled) setSupported(allowed);
        });
        return () => {
            cancelled = true;
        };
    }, [client]);

    useEffect(() => {
        if (!code) return undefined;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [code]);

    useEffect(() => {
        if (code && now >= code.expiresAt) setCode(null);
    }, [code, now]);

    useEffect(() => {
        if (!code || !canvasRef.current) return;
        void import("qrcode").then((QRCode) => {
            if (canvasRef.current) void QRCode.toCanvas(canvasRef.current, code.payload, { width: 220, margin: 2, errorCorrectionLevel: "M" });
        });
    }, [code]);

    if (supported === null) return null;

    const create = async (): Promise<void> => {
        setBusy(true);
        setError(null);
        try {
            const { token, expiresAt } = await makeLoginToken(client, password);
            setCode({ payload: encodeQrPayload({ homeserver: client.getHomeserverUrl(), token }), expiresAt });
            setNow(Date.now());
            setAsking(false);
        } catch (createError) {
            const status = (createError as { httpStatus?: number }).httpStatus;
            setError(status === 401 || status === 403 ? "That password didn't work." : createError instanceof Error ? createError.message : "Couldn't make a sign-in code.");
        } finally {
            setPassword("");
            setBusy(false);
        }
    };

    return (
        <div className="settings-section-card" data-testid="qr-login-show">
            <h3>Sign in another device</h3>
            {!supported ? (
                <p className="settings-inline-note">
                    Your homeserver doesn&apos;t allow signing in with a code from another device. (Server admins: enable
                    login_via_existing_session in Synapse.)
                </p>
            ) : code ? (
                <>
                    <canvas ref={canvasRef} className="qr-login-canvas" aria-label="Sign-in QR code" role="img" />
                    <p className="settings-inline-error">
                        Anyone who scans this can sign in as you until it&apos;s used or expires ({Math.max(0, Math.ceil((code.expiresAt - now) / 1000))} s).
                        Only scan it with your own device, and don&apos;t show it on stream.
                    </p>
                    <details>
                        <summary>Can&apos;t scan? Use the code</summary>
                        <code className="qr-login-text" data-testid="qr-login-payload">{code.payload}</code>
                    </details>
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => setCode(null)}>
                        Hide
                    </button>
                </>
            ) : asking ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void create();
                    }}
                >
                    <label className="settings-field">
                        <span>Your password (to confirm it&apos;s you)</span>
                        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" data-testid="qr-login-password" />
                    </label>
                    <button type="submit" className="settings-button" disabled={busy || !password} data-testid="qr-login-create">
                        {busy ? "Making code..." : "Show QR code"}
                    </button>
                </form>
            ) : (
                <>
                    <p className="settings-tab-description">On your phone or new computer, choose &quot;Sign in with QR code&quot; and scan the code shown here.</p>
                    <button type="button" className="settings-button" onClick={() => setAsking(true)} data-testid="qr-login-start">
                        Show a sign-in QR code
                    </button>
                </>
            )}
            {error ? <p className="settings-inline-error">{error}</p> : null}
        </div>
    );
}

export function ScanLoginQr({
    deviceDisplayName,
    onCredentials,
    onCancel,
}: {
    deviceDisplayName?: string;
    onCredentials: (credentials: MatrixCredentials) => Promise<void>;
    onCancel: () => void;
}): React.ReactElement {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [pasted, setPasted] = useState("");
    const [status, setStatus] = useState<string | null>("Starting camera...");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);

    const signInWith = async (text: string): Promise<void> => {
        if (busyRef.current) return;
        const payload = parseQrPayload(text);
        if (!payload) {
            setError("That isn't a Meadhall sign-in code.");
            return;
        }
        busyRef.current = true;
        setBusy(true);
        setError(null);
        try {
            await onCredentials(await loginWithQrPayload(payload, deviceDisplayName));
        } catch (loginError) {
            const status = (loginError as { httpStatus?: number }).httpStatus;
            setError(status === 403 || status === 401 ? "That code has expired or was already used. Make a new one." : loginError instanceof Error ? loginError.message : "Couldn't sign in.");
            busyRef.current = false;
            setBusy(false);
        }
    };
    const signInRef = useRef(signInWith);
    signInRef.current = signInWith;

    useEffect(() => {
        let stream: MediaStream | null = null;
        let timer: number | undefined;
        let stopped = false;
        void navigator.mediaDevices
            ?.getUserMedia({ video: { facingMode: "environment" } })
            .then((media) => {
                if (stopped) {
                    media.getTracks().forEach((track) => track.stop());
                    return;
                }
                stream = media;
                const video = videoRef.current;
                if (!video) return;
                video.srcObject = media;
                void video.play().catch(() => undefined);
                setStatus("Point the camera at the QR code.");
                timer = window.setInterval(() => {
                    if (!videoRef.current || !canvasRef.current || busyRef.current) return;
                    void readQrFromVideo(videoRef.current, canvasRef.current).then((text) => {
                        if (text && parseQrPayload(text)) void signInRef.current(text);
                    });
                }, 400);
            })
            .catch(() => setStatus("No camera available: paste the code instead."));
        return () => {
            stopped = true;
            window.clearInterval(timer);
            stream?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    return (
        <div className="qr-login-scan" data-testid="qr-login-scan">
            <p className="login-subtitle">On a device where you&apos;re signed in: Settings → Devices → Sign in another device.</p>
            <video ref={videoRef} className="qr-login-video" muted playsInline />
            <canvas ref={canvasRef} hidden />
            {status ? <p className="settings-inline-note">{status}</p> : null}
            <label>
                Or paste the code
                <input type="text" value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="meadhall-login:1?..." data-testid="qr-login-paste" />
            </label>
            {error ? <p className="login-error">{error}</p> : null}
            <button type="button" disabled={busy || !pasted.trim()} onClick={() => void signInWith(pasted)} data-testid="qr-login-paste-submit">
                {busy ? "Signing in..." : "Sign in with code"}
            </button>
            <button type="button" className="login-secondary-button" onClick={onCancel}>
                Back
            </button>
        </div>
    );
}
