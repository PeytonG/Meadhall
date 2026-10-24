// SPDX-License-Identifier: AGPL-3.0-only
// A readable "which Meadhall, on what" line for bug reports, e.g.
// "Meadhall 0.3.4 · Desktop app · Windows 64-bit · Electron 44.9.3 (Chrome 152)".
export function environmentSummary(userAgent: string, version: string, platform: "desktop" | "mobile" | "web"): string {
    const os = /Windows NT/.test(userAgent)
        ? `Windows${/Win64|x64|WOW64/.test(userAgent) ? " 64-bit" : ""}`
        : /Android ([\d.]+)/.test(userAgent)
          ? `Android ${userAgent.match(/Android ([\d.]+)/)![1]}`
          : /iPhone|iPad/.test(userAgent)
            ? "iOS"
            : /Mac OS X/.test(userAgent)
              ? "macOS"
              : /Linux/.test(userAgent)
                ? "Linux"
                : "Unknown system";
    const electron = userAgent.match(/Electron\/([\d.]+)/)?.[1];
    const chrome = userAgent.match(/Chrome\/(\d+)/)?.[1];
    const firefox = userAgent.match(/Firefox\/(\d+)/)?.[1];
    const engine = electron ? `Electron ${electron}${chrome ? ` (Chrome ${chrome})` : ""}` : chrome ? `Chrome ${chrome}` : firefox ? `Firefox ${firefox}` : "";
    const app = platform === "desktop" ? "Desktop app" : platform === "mobile" ? "Phone app" : "Web";
    return [`Meadhall ${version || "(web)"}`, app, os, engine].filter(Boolean).join(" · ");
}
