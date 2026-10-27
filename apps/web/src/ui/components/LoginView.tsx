import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGES, chosenLanguage, setLanguage, t, useLanguage } from "../i18n";
import { ScanLoginQr } from "../auth/QrLoginCards";
import { AuthType, MatrixError, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { addingAccountFrom } from "../../core/storage/accounts";
import { cancelAddingAccount } from "../accounts/accountSwitching";
import type { MatrixCredentials } from "../../core/types/credentials";
import { normalizeHomeserverUrl, resolveHomeserverBaseUrl } from "../adapters/loginAdapter";
import {
    authStepIsRequired,
    authStepIsUsed,
    buildRegistrationSsoUrl,
    checkRegistrationTokenValidity,
    discoverRegistrationFlow,
    formatRegistrationError,
    looksLikeEmail,
    RegistrationProbeError,
    registrationTokenUsage,
    type RegistrationFlow,
} from "../adapters/registrationAdapter";
import loginHall from "../assets/login-hall.webp";
import meadhallIcon from "../assets/meadhall-icon.png";
import { DEFAULT_HOMESERVER_URL } from "../../core/config/serverDefaults";
import { RegistrationInteractiveAuth } from "./auth/RegistrationInteractiveAuth";

type AuthMode = "sign_in" | "register";
type RegistrationStep = "form" | "uia";

interface LoginViewProps {
    brandName: string;
    deviceDisplayName: string;
    defaultHomeserver: string;
    defaultIdentityServer?: string;
    disableHomeserverInput: boolean;
    loading: boolean;
    error: string | null;
    onLogin: (homeserverUrl: string, username: string, password: string) => Promise<void>;
    onLoginWithCredentials: (credentials: MatrixCredentials) => Promise<void>;
}

export function LoginView({
    brandName,
    deviceDisplayName,
    defaultHomeserver,
    defaultIdentityServer,
    disableHomeserverInput,
    loading,
    error,
    onLogin,
    onLoginWithCredentials,
}: LoginViewProps): React.ReactElement {
    useLanguage(); // re-render in the chosen language
    const [scanningQr, setScanningQr] = useState(false);
    const [mode, setMode] = useState<AuthMode>("sign_in");
    // Adding another account: offer the way back to the one already signed in.
    const [addingFrom] = useState(addingAccountFrom);
    const [homeserver, setHomeserver] = useState(defaultHomeserver);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const [registerStep, setRegisterStep] = useState<RegistrationStep>("form");
    const [registerClient, setRegisterClient] = useState<MatrixClient | null>(null);
    const [registerFlows, setRegisterFlows] = useState<RegistrationFlow[]>([]);
    const [registerUsername, setRegisterUsername] = useState("");
    const [registerEmail, setRegisterEmail] = useState("");
    const [registerPassword, setRegisterPassword] = useState("");
    const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
    const [registerUsesEmail, setRegisterUsesEmail] = useState(false);
    const [registerRequiresEmail, setRegisterRequiresEmail] = useState(false);
    const [registerBusy, setRegisterBusy] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [registerSsoUrl, setRegisterSsoUrl] = useState<string | null>(null);
    const [showRegisterPassword, setShowRegisterPassword] = useState(false);
    const [registerToken, setRegisterToken] = useState("");
    // Whether the server's sign-up flows ask for a registration token; "unknown" until probed (shows the field).
    const [tokenUsage, setTokenUsage] = useState<"required" | "optional" | "none" | "unknown">("unknown");

    // Ask the server how sign-up works as soon as the Register tab is open, so the token field shows up front.
    useEffect(() => {
        if (mode !== "register" || homeserver.trim().length === 0) {
            return undefined;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            void (async () => {
                try {
                    const resolved = await resolveHomeserverBaseUrl(normalizeHomeserverUrl(homeserver));
                    const probe = await discoverRegistrationFlow({ homeserverUrl: resolved });
                    if (!cancelled) {
                        setTokenUsage(registrationTokenUsage(probe.flows));
                    }
                } catch {
                    if (!cancelled) {
                        setTokenUsage("unknown");
                    }
                }
            })();
        }, 500);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [homeserver, mode]);

    const switchMode = useCallback((nextMode: AuthMode): void => {
        setMode(nextMode);
        if (nextMode === "sign_in") {
            setRegisterStep("form");
            setRegisterError(null);
        }
    }, []);

    const canSignIn = useMemo(() => {
        return homeserver.trim().length > 0 && username.trim().length > 0 && password.length > 0 && !loading;
    }, [homeserver, loading, password, username]);

    const canStartRegistration = useMemo(() => {
        if (registerStep !== "form" || registerBusy) {
            return false;
        }

        if (homeserver.trim().length === 0 || registerUsername.trim().length === 0) {
            return false;
        }

        if (registerPassword.length === 0 || registerPasswordConfirm.length === 0) {
            return false;
        }

        return true;
    }, [homeserver, registerBusy, registerPassword, registerPasswordConfirm, registerStep, registerUsername]);

    const handleSignInSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();
        if (!canSignIn) {
            return;
        }

        await onLogin(homeserver.trim(), username.trim(), password);
    };

    const handleRegistrationCompleted = useCallback(
        async (credentials: MatrixCredentials): Promise<void> => {
            setRegisterError(null);
            setRegisterBusy(true);
            try {
                await onLoginWithCredentials(credentials);
            } catch (completionError) {
                setRegisterError(completionError instanceof Error ? completionError.message : String(completionError));
            } finally {
                setRegisterBusy(false);
            }
        },
        [onLoginWithCredentials],
    );

    const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();
        if (!canStartRegistration) {
            return;
        }

        const normalizedUsername = registerUsername.trim();
        const normalizedEmail = registerEmail.trim();

        if (registerPassword.length < 8) {
            setRegisterError("Password must have at least 8 characters.");
            return;
        }

        if (registerPassword !== registerPasswordConfirm) {
            setRegisterError("Passwords do not match.");
            return;
        }

        if (normalizedEmail.length > 0 && !looksLikeEmail(normalizedEmail)) {
            setRegisterError("Email format is invalid.");
            return;
        }

        setRegisterBusy(true);
        setRegisterError(null);
        setRegisterSsoUrl(null);

        try {
            const normalizedHomeserver = await resolveHomeserverBaseUrl(normalizeHomeserverUrl(homeserver));
            const probe = await discoverRegistrationFlow({
                homeserverUrl: normalizedHomeserver,
                identityServerUrl: defaultIdentityServer,
            });

            if (probe.flows.length === 0) {
                throw new Error("Homeserver did not return supported registration flows.");
            }

            let usernameAvailable = false;
            try {
                usernameAvailable = await probe.client.isUsernameAvailable(normalizedUsername);
            } catch (usernameError) {
                if (usernameError instanceof MatrixError && usernameError.errcode === "M_INVALID_USERNAME") {
                    setRegisterError("This username is not allowed by homeserver policy.");
                    return;
                }
                throw usernameError;
            }

            if (!usernameAvailable) {
                setRegisterError("Username is already in use.");
                return;
            }

            const usage = registrationTokenUsage(probe.flows);
            setTokenUsage(usage);
            const token = registerToken.trim();
            if (usage === "required" && token.length === 0) {
                setRegisterError("This server needs a registration token. Ask the server admin for one.");
                return;
            }
            if (usage !== "none" && token.length > 0) {
                const valid = await checkRegistrationTokenValidity(normalizedHomeserver, token);
                if (valid === false) {
                    setRegisterError("That registration token isn't valid. Check it, or ask the server admin for a new one.");
                    return;
                }
            }

            const emailUsed = authStepIsUsed(probe.flows, AuthType.Email);
            const emailRequired = authStepIsRequired(probe.flows, AuthType.Email);
            if (emailRequired && normalizedEmail.length === 0) {
                setRegisterError("This homeserver requires an email address for registration.");
                return;
            }

            if (emailUsed && !emailRequired && normalizedEmail.length === 0) {
                const proceed = window.confirm(
                    "Continue without email? You may not be able to reset your password if you lose access.",
                );
                if (!proceed) {
                    return;
                }
            }

            setRegisterUsesEmail(emailUsed);
            setRegisterRequiresEmail(emailRequired);
            setRegisterFlows(probe.flows);
            setRegisterClient(probe.client);
            setRegisterStep("uia");
        } catch (registrationFailure) {
            if (registrationFailure instanceof RegistrationProbeError && registrationFailure.code === "registration_disabled_sso") {
                const ssoFlow = registrationFailure.ssoFlow;
                const registrationClient = registrationFailure.client;
                if (ssoFlow && registrationClient) {
                    const loginType = ssoFlow.type === "m.login.cas" ? "cas" : "sso";
                    setRegisterSsoUrl(
                        buildRegistrationSsoUrl({
                            client: registrationClient,
                            loginType,
                        }),
                    );
                }
            }

            setRegisterError(formatRegistrationError(registrationFailure));
        } finally {
            setRegisterBusy(false);
        }
    };

    const providerError = error;
    const displayError = mode === "sign_in" ? providerError : registerError ?? providerError;
    const flowContentRef = useRef<HTMLDivElement | null>(null);
    const [flowHeight, setFlowHeight] = useState<number | null>(null);

    const syncFlowHeight = useCallback((): void => {
        const nextHeight = flowContentRef.current?.getBoundingClientRect().height;
        if (!nextHeight || nextHeight <= 0) {
            return;
        }

        const roundedHeight = Math.ceil(nextHeight);
        setFlowHeight((currentHeight) => (currentHeight === roundedHeight ? currentHeight : roundedHeight));
    }, []);

    useEffect(() => {
        let animationFrameId: number | null = null;

        const scheduleHeightSync = (): void => {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
            }

            animationFrameId = requestAnimationFrame(() => {
                animationFrameId = null;
                syncFlowHeight();
            });
        };

        scheduleHeightSync();

        const observedElement = flowContentRef.current;
        if (!observedElement || typeof ResizeObserver === "undefined") {
            return () => {
                if (animationFrameId !== null) {
                    cancelAnimationFrame(animationFrameId);
                }
            };
        }

        const observer = new ResizeObserver(() => {
            scheduleHeightSync();
        });
        observer.observe(observedElement);

        return () => {
            observer.disconnect();
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [syncFlowHeight, mode, registerStep]);

    return (
        <div className="login-view has-backdrop" style={{ ["--login-backdrop" as string]: `url(${loginHall})` }}>
            <div className="login-card login-card-wide">
                {addingFrom ? (
                    <button type="button" className="login-back-to-account" onClick={() => void cancelAddingAccount()} data-testid="back-to-account">
                        ← Back to {addingFrom}
                    </button>
                ) : null}
                <div className="login-brand">
                    <img src={meadhallIcon} alt="" />
                    <h1>{brandName}</h1>
                </div>
                <div className="login-mode-switch" role="tablist" aria-label="Authentication flow">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === "sign_in"}
                        className={`login-mode-button${mode === "sign_in" ? " is-active" : ""}`}
                        onClick={() => switchMode("sign_in")}
                    >
                        {t("Sign in")}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === "register"}
                        className={`login-mode-button${mode === "register" ? " is-active" : ""}`}
                        onClick={() => switchMode("register")}
                    >
                        {t("Register")}
                    </button>
                </div>
                <label className="login-language">
                    <span>{t("Language")}</span>
                    <select value={chosenLanguage()} onChange={(event) => setLanguage(event.target.value)} data-testid="login-language">
                        <option value="system">{t("System default")}</option>
                        {LANGUAGES.map((language) => (
                            <option key={language.code} value={language.code}>
                                {language.name}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="login-flow-shell" style={flowHeight === null ? undefined : { height: `${flowHeight}px` }}>
                    <div className="login-flow-content" ref={flowContentRef}>
                        {mode === "sign_in" && scanningQr ? (
                    <ScanLoginQr deviceDisplayName={deviceDisplayName} onCredentials={onLoginWithCredentials} onCancel={() => setScanningQr(false)} />
                ) : mode === "sign_in" ? (
                    <>
                    <form onSubmit={handleSignInSubmit}>
                        <p className="login-subtitle">{t("Sign in to continue")}</p>

                        <label>
                            {t("Homeserver")}
                            <input
                                type="url"
                                value={homeserver}
                                onChange={(event) => setHomeserver(event.target.value)}
                                placeholder={DEFAULT_HOMESERVER_URL}
                                autoComplete="url"
                                disabled={disableHomeserverInput}
                            />
                        </label>

                        <label>
                            {t("Username or email")}
                            <input
                                type="text"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                placeholder="alice"
                                autoComplete="username"
                            />
                        </label>

                        <label>
                            {t("Password")}
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="********"
                                autoComplete="current-password"
                            />
                        </label>

                        <label className="login-checkbox">
                            <input
                                type="checkbox"
                                checked={showPassword}
                                onChange={(event) => setShowPassword(event.target.checked)}
                            />
                            <span>{t("Show password")}</span>
                        </label>

                        {displayError && <p className="login-error">{displayError}</p>}

                        <button type="submit" disabled={!canSignIn}>
                            {loading ? t("Signing in...") : t("Sign in")}
                        </button>
                    </form>
                    <button type="button" className="login-secondary-button login-qr-button" onClick={() => setScanningQr(true)} data-testid="login-with-qr">
                        {t("Sign in with QR code")}
                    </button>
                    </>
                ) : registerStep === "form" ? (
                    <form onSubmit={handleRegisterSubmit}>
                        <p className="login-subtitle">{t("Create a Matrix account with Matrix-native verification stages.")}</p>
                        <label>
                            {t("Homeserver")}
                            <input
                                type="url"
                                value={homeserver}
                                onChange={(event) => setHomeserver(event.target.value)}
                                placeholder={DEFAULT_HOMESERVER_URL}
                                autoComplete="url"
                                disabled={disableHomeserverInput || registerBusy}
                            />
                        </label>

                        <label>
                            {t("Username")}
                            <input
                                type="text"
                                value={registerUsername}
                                onChange={(event) => setRegisterUsername(event.target.value)}
                                placeholder="alice"
                                autoComplete="username"
                            />
                        </label>

                        {tokenUsage !== "none" ? (
                            <label>
                                {tokenUsage === "required" ? t("Registration token") : t("Registration token (if you have one)")}
                                <input
                                    type="text"
                                    value={registerToken}
                                    onChange={(event) => setRegisterToken(event.target.value)}
                                    placeholder={t("From your server admin")}
                                    autoComplete="off"
                                    spellCheck={false}
                                    data-testid="registration-token"
                                />
                            </label>
                        ) : null}

                        <label>
                            {t("Email (optional)")}
                            <input
                                type="email"
                                value={registerEmail}
                                onChange={(event) => setRegisterEmail(event.target.value)}
                                placeholder="alice@example.com"
                                autoComplete="email"
                            />
                        </label>

                        <label>
                            {t("Password")}
                            <input
                                type={showRegisterPassword ? "text" : "password"}
                                value={registerPassword}
                                onChange={(event) => setRegisterPassword(event.target.value)}
                                placeholder={t("At least 8 characters")}
                                autoComplete="new-password"
                            />
                        </label>

                        <label>
                            {t("Confirm password")}
                            <input
                                type={showRegisterPassword ? "text" : "password"}
                                value={registerPasswordConfirm}
                                onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                                placeholder={t("Repeat password")}
                                autoComplete="new-password"
                            />
                        </label>

                        <label className="login-checkbox">
                            <input
                                type="checkbox"
                                checked={showRegisterPassword}
                                onChange={(event) => setShowRegisterPassword(event.target.checked)}
                            />
                            <span>{t("Show passwords")}</span>
                        </label>

                        {displayError && <p className="login-error">{displayError}</p>}

                        {registerSsoUrl ? (
                            <button type="button" className="login-secondary-button" onClick={() => (window.location.href = registerSsoUrl)}>
                                {t("Continue with SSO registration")}
                            </button>
                        ) : null}

                        <button type="submit" disabled={!canStartRegistration}>
                            {registerBusy ? t("Preparing registration...") : t("Create account")}
                        </button>
                    </form>
                ) : registerClient ? (
                    <RegistrationInteractiveAuth
                        client={registerClient}
                        username={registerUsername}
                        password={registerPassword}
                        registrationToken={registerToken.trim() || undefined}
                        emailAddress={registerUsesEmail ? registerEmail.trim() || undefined : undefined}
                        initialDeviceDisplayName={deviceDisplayName}
                        onCompleted={handleRegistrationCompleted}
                        onBack={() => {
                            setRegisterStep("form");
                            setRegisterError(null);
                        }}
                    />
                ) : (
                    <div>
                        <p className="login-error">Registration state was lost. Please restart registration.</p>
                        <button
                            type="button"
                            onClick={() => {
                                setRegisterStep("form");
                                setRegisterError(null);
                            }}
                        >
                            Back to form
                        </button>
                    </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
