import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./ui/App";
import { OverlayApp } from "./ui/overlay/OverlayApp";
import "./ui/styles/overlay.css";
import { registerMediaServiceWorker } from "./ui/serviceWorker/registerMediaServiceWorker";

// The desktop app's game overlay window loads the same page with #overlay (apps/desktop/electron/overlay.ts).
const isOverlay = window.location.hash === "#overlay";
if (!isOverlay) void registerMediaServiceWorker();

const rootElement = document.getElementById("root");
if (!rootElement) {
    throw new Error("Missing #root mount element");
}

createRoot(rootElement).render(
    <React.StrictMode>
        {isOverlay ? <OverlayApp /> : <App />}
    </React.StrictMode>,
);
