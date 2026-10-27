import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedSecretStorageKey } from "matrix-js-sdk/src/crypto-api";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import {
    adoptCrossSigningWithRecoveryKey,
    bootstrapSecretStorageSetup,
    createSecretStorageSetupKey,
    getSessionTrust,
    isRecoveryKeyValid,
    restoreKeyBackupWithSecretStorageCredential,
    triggerRoomHistoryDecryption,
} from "../../../adapters/securityRecoveryAdapter";
import { useMatrix } from "../../../providers/MatrixProvider";

interface EncryptionTabProps {
    client: MatrixClient;
    verificationNonce: number;
    onOpenVerification: () => void;
}

export function EncryptionTab({ client, verificationNonce, onOpenVerification }: EncryptionTabProps): React.ReactElement {
    const matrix = useMatrix();
    const [crossSigningReady, setCrossSigningReady] = useState(false);
    const [backupVersion, setBackupVersion] = useState<string | null>(null);
    const [hasRecoveryKey, setHasRecoveryKey] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [setupNonce, setSetupNonce] = useState(0);
    // Verified as your other apps see it (signed by your cross-signing key), and whether this session holds those keys
    // (needed to change the recovery key without locking them away).
    const [sessionVerified, setSessionVerified] = useState(false);
    const [holdsSigningKeys, setHoldsSigningKeys] = useState(false);
    const [recoveryInput, setRecoveryInput] = useState("");
    const [recoveryBusy, setRecoveryBusy] = useState(false);
    const [recoveryMessage, setRecoveryMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const [setupOpen, setSetupOpen] = useState(false);
    const [setupGeneratedKey, setSetupGeneratedKey] = useState("");
    const [setupCopied, setSetupCopied] = useState(false);
    const [setupDownloaded, setSetupDownloaded] = useState(false);
    const [setupBusy, setSetupBusy] = useState(false);
    const [setupError, setSetupError] = useState<string | null>(null);
    const [setupSuccess, setSetupSuccess] = useState<string | null>(null);
    const pendingSetupKeyRef = useRef<GeneratedSecretStorageKey | null>(null);

    const clearPendingSetupKey = (): void => {
        const pendingSetupKey = pendingSetupKeyRef.current;
        if (!pendingSetupKey) {
            return;
        }

        pendingSetupKey.privateKey.fill(0);
        pendingSetupKeyRef.current = null;
    };

    useEffect(() => {
        let canceled = false;

        const loadCryptoStatus = async (): Promise<void> => {
            const crypto = client.getCrypto();
            if (!crypto) {
                setCrossSigningReady(false);
                setBackupVersion(null);
                setHasRecoveryKey(false);
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const [isCrossSigningReady, activeBackupVersion, defaultRecoveryKeyId, trust, crossSigningStatus] = await Promise.all([
                    crypto.isCrossSigningReady(),
                    crypto.getActiveSessionBackupVersion(),
                    client.secretStorage.getDefaultKeyId(),
                    getSessionTrust(client),
                    crypto.getCrossSigningStatus(),
                ]);
                const localKeys = crossSigningStatus.privateKeysCachedLocally;

                if (!canceled) {
                    setCrossSigningReady(Boolean(isCrossSigningReady));
                    setBackupVersion(activeBackupVersion);
                    setHasRecoveryKey(Boolean(defaultRecoveryKeyId));
                    setSessionVerified(trust.signedByAccount && trust.trustsAccount);
                    setHoldsSigningKeys(localKeys.masterKey && localKeys.selfSigningKey && localKeys.userSigningKey);
                }
            } catch (loadError) {
                if (!canceled) {
                    setError(loadError instanceof Error ? loadError.message : "Failed to read encryption status.");
                }
            } finally {
                if (!canceled) {
                    setLoading(false);
                }
            }
        };

        void loadCryptoStatus();
        return () => {
            canceled = true;
        };
    }, [client, matrix.localDeviceVerified, verificationNonce, setupNonce]);

    useEffect(() => {
        return () => {
            clearPendingSetupKey();
        };
    }, []);

    const canGenerateSetup = !setupBusy;
    const canFinishSetup = useMemo(() => {
        if (setupBusy || setupGeneratedKey.trim().length === 0) {
            return false;
        }

        return setupCopied || setupDownloaded;
    }, [setupBusy, setupGeneratedKey, setupCopied, setupDownloaded]);

    const resetSetupForm = (): void => {
        clearPendingSetupKey();
        setSetupGeneratedKey("");
        setSetupCopied(false);
        setSetupDownloaded(false);
        setSetupBusy(false);
        setSetupError(null);
    };

    const handleGenerateSetupKey = async (): Promise<void> => {
        if (!canGenerateSetup) {
            return;
        }

        setSetupBusy(true);
        setSetupError(null);
        setSetupSuccess(null);
        try {
            const generatedKey = await createSecretStorageSetupKey(client);
            const encodedKey = generatedKey.encodedPrivateKey?.trim();
            if (!encodedKey) {
                generatedKey.privateKey.fill(0);
                throw new Error("Failed to generate security key.");
            }

            clearPendingSetupKey();
            pendingSetupKeyRef.current = generatedKey;
            setSetupGeneratedKey(encodedKey);
            setSetupCopied(false);
            setSetupDownloaded(false);
        } catch (generationError) {
            setSetupError(generationError instanceof Error ? generationError.message : "Failed to generate security key.");
        } finally {
            setSetupBusy(false);
        }
    };

    const handleCopySetupKey = async (): Promise<void> => {
        if (setupGeneratedKey.trim().length === 0) {
            return;
        }

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(setupGeneratedKey);
            } else {
                const helper = document.createElement("textarea");
                helper.value = setupGeneratedKey;
                helper.setAttribute("readonly", "");
                helper.style.position = "absolute";
                helper.style.left = "-9999px";
                document.body.appendChild(helper);
                helper.select();
                document.execCommand("copy");
                document.body.removeChild(helper);
            }
            setSetupCopied(true);
        } catch {
            setSetupError("Unable to copy security key. Copy it manually from the field.");
        }
    };

    const handleDownloadSetupKey = (): void => {
        if (setupGeneratedKey.trim().length === 0) {
            return;
        }

        const blob = new Blob([setupGeneratedKey], { type: "text/plain;charset=us-ascii" });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = "security-key.txt";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        setSetupDownloaded(true);
    };

    const handleFinishSetup = async (): Promise<void> => {
        if (!canFinishSetup) {
            return;
        }

        const setupKey = pendingSetupKeyRef.current;
        if (!setupKey) {
            setSetupError("Security key was not generated. Generate a new key first.");
            return;
        }

        setSetupBusy(true);
        setSetupError(null);
        setSetupSuccess(null);
        try {
            await bootstrapSecretStorageSetup(client, setupKey);
            clearPendingSetupKey();
            setSetupGeneratedKey("");
            setSetupCopied(false);
            setSetupDownloaded(false);
            setSetupOpen(false);
            setSetupSuccess(hasRecoveryKey ? "Recovery key changed." : "Recovery key set up.");
            setSetupNonce((value) => value + 1);
        } catch (completeError) {
            setSetupError(completeError instanceof Error ? completeError.message : "Failed to set up secure backup.");
        } finally {
            setSetupBusy(false);
        }
    };

    const handleVerifyWithRecoveryKey = async (): Promise<void> => {
        const recoveryKey = recoveryInput.trim();
        if (!isRecoveryKeyValid(recoveryKey)) {
            setRecoveryMessage({ ok: false, text: "That doesn't look like a recovery key. Check for typos." });
            return;
        }
        setRecoveryBusy(true);
        setRecoveryMessage(null);
        try {
            // Message history first (best effort: there may be no backup), then the signing keys.
            await restoreKeyBackupWithSecretStorageCredential(client, recoveryKey).catch(() => undefined);
            const signed = await adoptCrossSigningWithRecoveryKey(client, recoveryKey);
            if (!signed) {
                setRecoveryMessage({
                    ok: false,
                    text: "That key didn't unlock your account's signing keys. Use the newest recovery key you saved, or verify from another session.",
                });
                return;
            }
            setRecoveryInput("");
            setRecoveryMessage({ ok: true, text: "This session is verified. Your other apps will now trust it." });
            triggerRoomHistoryDecryption(client);
            setSetupNonce((value) => value + 1);
        } catch (verifyError) {
            setRecoveryMessage({ ok: false, text: verifyError instanceof Error ? verifyError.message : "Couldn't verify this session." });
        } finally {
            setRecoveryBusy(false);
        }
    };

    return (
        <div className="settings-tab">
            <h2 className="settings-tab-title">Encryption & Recovery</h2>
            <p className="settings-tab-description">
                Surface existing verification and key backup flows without changing crypto primitives.
            </p>

            {loading ? <p className="settings-inline-note">Loading encryption status...</p> : null}
            {error ? <p className="settings-inline-error">{error}</p> : null}

            <div className="settings-info-grid">
                <div className="settings-info-item">
                    <span className="settings-info-label">Cross-signing</span>
                    <strong>{crossSigningReady ? "Ready" : "Not ready"}</strong>
                </div>
                <div className="settings-info-item">
                    <span className="settings-info-label">Active key backup</span>
                    <strong>{backupVersion ?? "Not enabled"}</strong>
                </div>
                <div className="settings-info-item">
                    <span className="settings-info-label">This device verified</span>
                    <strong data-testid="session-verified">{sessionVerified ? "Yes" : "No"}</strong>
                </div>
                <div className="settings-info-item">
                    <span className="settings-info-label">Force verification policy</span>
                    <strong>{matrix.forceVerificationEnabled ? "Enabled" : "Disabled"}</strong>
                </div>
            </div>

            <div className="settings-actions-row">
                <button
                    type="button"
                    className="settings-button"
                    onClick={onOpenVerification}
                >
                    Verify this device
                </button>
                <button
                    type="button"
                    className="settings-button settings-button-secondary"
                    onClick={() => {
                        void matrix.refreshTrustStatus().then(() => setSetupNonce((value) => value + 1));
                    }}
                >
                    Refresh trust status
                </button>
            </div>

            {!sessionVerified && hasRecoveryKey ? (
                <form
                    className="settings-section-card"
                    data-testid="verify-with-recovery-key"
                    onSubmit={(submitEvent) => {
                        submitEvent.preventDefault();
                        void handleVerifyWithRecoveryKey();
                    }}
                >
                    <h3>Verify with your recovery key</h3>
                    <p className="settings-inline-note">
                        Other apps (Element, FluffyChat, Meadhall on another device) only trust this session once it&apos;s
                        signed with your account&apos;s keys. Enter the recovery key you saved when you set up encryption,
                        in any app, to sign it and restore your message history.
                    </p>
                    <label className="settings-field">
                        <span>Recovery key</span>
                        <input
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="EsTc 1234 ..."
                            value={recoveryInput}
                            onChange={(changeEvent) => setRecoveryInput(changeEvent.target.value)}
                            disabled={recoveryBusy}
                        />
                    </label>
                    {recoveryMessage ? (
                        <p className={recoveryMessage.ok ? "settings-inline-note settings-recovery-success" : "settings-inline-error"}>
                            {recoveryMessage.text}
                        </p>
                    ) : null}
                    <div className="settings-actions-row">
                        <button type="submit" className="settings-button" disabled={recoveryBusy || recoveryInput.trim().length === 0}>
                            {recoveryBusy ? "Verifying..." : "Verify this session"}
                        </button>
                    </div>
                </form>
            ) : null}

            <div className="settings-section-card settings-recovery-card">
                <div className="settings-recovery-header">
                    <h3>Secure Backup</h3>
                    <span className={`settings-recovery-badge${hasRecoveryKey ? " is-ready" : " is-missing"}`}>
                        {hasRecoveryKey ? "Configured" : "Recommended"}
                    </span>
                </div>

                <p className="settings-inline-note">
                    {hasRecoveryKey
                        ? "Your account has a recovery key configured. You can rotate it if needed."
                        : "Set up a recovery key to restore encrypted history on new sessions and devices."}
                </p>

                {setupSuccess ? <p className="settings-inline-note settings-recovery-success">{setupSuccess}</p> : null}

                {hasRecoveryKey && !holdsSigningKeys ? (
                    <p className="settings-inline-note" data-testid="recovery-key-locked">
                        Verify this session first (with your recovery key above, or from another session) to change the
                        recovery key. Changing it from here now would lock away the keys your other apps use to trust
                        your sessions.
                    </p>
                ) : null}

                <div className="settings-actions-row">
                    <button
                        type="button"
                        className="settings-button"
                        disabled={setupBusy || (hasRecoveryKey && !holdsSigningKeys)}
                        onClick={() => {
                            setSetupOpen((previous) => {
                                if (previous) {
                                    resetSetupForm();
                                }
                                return !previous;
                            });
                            setSetupError(null);
                            setSetupSuccess(null);
                        }}
                    >
                        {setupOpen ? "Hide recovery setup" : hasRecoveryKey ? "Change recovery key" : "Set up recovery key"}
                    </button>
                </div>

                {setupOpen ? (
                    <div className="settings-recovery-setup">
                        {setupGeneratedKey ? (
                            <div className="settings-recovery-key-box">
                                <p className="settings-inline-note settings-recovery-key-label">Security key</p>
                                <code>{setupGeneratedKey}</code>
                                <p className="settings-inline-note">
                                    Save this key offline. You will need it to unlock encrypted history later.
                                </p>
                                <div className="settings-actions-row">
                                    <button
                                        type="button"
                                        className="settings-button settings-button-secondary"
                                        onClick={() => void handleCopySetupKey()}
                                        disabled={setupBusy}
                                    >
                                        {setupCopied ? "Copied" : "Copy key"}
                                    </button>
                                    <button
                                        type="button"
                                        className="settings-button settings-button-secondary"
                                        onClick={handleDownloadSetupKey}
                                        disabled={setupBusy}
                                    >
                                        {setupDownloaded ? "Downloaded" : "Download .txt"}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {setupError ? <p className="settings-inline-error">{setupError}</p> : null}

                        <div className="settings-actions-row">
                            {setupGeneratedKey ? (
                                <button
                                    type="button"
                                    className="settings-button"
                                    onClick={() => void handleFinishSetup()}
                                    disabled={!canFinishSetup}
                                >
                                    {setupBusy ? "Finishing..." : "Finish secure backup"}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="settings-button"
                                    onClick={() => void handleGenerateSetupKey()}
                                    disabled={!canGenerateSetup}
                                >
                                    {setupBusy ? "Generating..." : "Generate security key"}
                                </button>
                            )}
                            <button
                                type="button"
                                className="settings-button settings-button-secondary"
                                onClick={() => {
                                    resetSetupForm();
                                    setSetupOpen(false);
                                    setSetupSuccess(null);
                                }}
                                disabled={setupBusy}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            <p className="settings-inline-note">
                Backup recovery still opens automatically during login when encrypted history needs a recovery credential.
            </p>
        </div>
    );
}
