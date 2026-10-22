import React, { useEffect } from "react";

import { getBrandName, getDeviceDisplayName } from "../core/config/branding";
import { getDefaultHomeserver, getDefaultIdentityServer, isCustomHomeserverDisabled } from "../core/config/serverDefaults";
import { AppShell } from "./components/AppShell";
import { DeviceVerificationView } from "./components/DeviceVerificationView";
import { LoginView } from "./components/LoginView";
import { SecurityRecoveryView } from "./components/SecurityRecoveryView";
import { MatrixProvider, useMatrix } from "./providers/MatrixProvider";
import { applyAppearanceTheme, loadUserLocalSettings } from "./settings/user/settingsStore";
import "./styles/App.css";
import "./styles/composer.css";
import "./styles/channelHeader.css";
import "./styles/rightPanel.css";
import "./settings/styles.css";
// Pixel-art look: fonts and global overrides, loaded after every other stylesheet.
import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import "@fontsource/silkscreen/400.css";
import "./styles/pixel.css";

function LoadingView({ label }: { label: string }): React.ReactElement {
    return (
        <div className="loading-screen">
            <div className="loading-spinner" />
            <p>{label}</p>
        </div>
    );
}

function AppRouter(): React.ReactElement {
    const matrix = useMatrix();
    const brandName = getBrandName(matrix.config);

    useEffect(() => {
        document.title = brandName;
    }, [brandName]);

    // Saved theme and accent color, so screens shown before the app shell (e.g. sign-in) use them too.
    useEffect(() => {
        applyAppearanceTheme(loadUserLocalSettings().appearance);
    }, []);

    if (matrix.status === "booting") {
        return <LoadingView label="Bootstrapping core..." />;
    }

    if (matrix.status === "starting") {
        return <LoadingView label="Starting Matrix session..." />;
    }

    if (matrix.status === "login_required") {
        return (
            <LoginView
                brandName={brandName}
                deviceDisplayName={getDeviceDisplayName(matrix.config, Boolean(window.heorotDesktop))}
                defaultHomeserver={getDefaultHomeserver(matrix.config)}
                defaultIdentityServer={getDefaultIdentityServer(matrix.config)}
                disableHomeserverInput={isCustomHomeserverDisabled(matrix.config)}
                loading={false}
                error={matrix.error}
                onLogin={matrix.login}
                onLoginWithCredentials={matrix.loginWithCredentials}
            />
        );
    }

    if (matrix.status === "security_recovery") {
        return (
            <SecurityRecoveryView
                flow={matrix.securityRecoveryFlow}
                error={matrix.error}
                onPrepareSetup={matrix.prepareSecurityRecoverySetup}
                onCompleteSetup={matrix.completeSecurityRecoverySetup}
                onRestore={matrix.completeSecurityRecovery}
                onSkip={matrix.skipSecurityRecovery}
            />
        );
    }

    if (matrix.status === "security_verification") {
        if (!matrix.client) {
            return <LoadingView label="Preparing verification..." />;
        }

        return (
            <DeviceVerificationView
                client={matrix.client}
                error={matrix.error}
                localDeviceVerified={matrix.localDeviceVerified}
                canSkip={!matrix.forceVerificationEnabled}
                onRefreshStatus={matrix.refreshDeviceVerification}
                onSkip={matrix.skipDeviceVerification}
                onLogout={matrix.logout}
            />
        );
    }

    if (matrix.status === "ready" && matrix.client) {
        return <AppShell client={matrix.client} onLogout={matrix.logout} />;
    }

    return (
        <div className="error-screen">
            <h1>Unable to start {brandName}</h1>
            <p>{matrix.error ?? "Unknown state"}</p>
        </div>
    );
}

export function App(): React.ReactElement {
    return (
        <MatrixProvider>
            <AppRouter />
        </MatrixProvider>
    );
}
