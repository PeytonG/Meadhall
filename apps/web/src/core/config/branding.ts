// SPDX-License-Identifier: AGPL-3.0-only
import type { CoreConfig } from "./configTypes";

// Meadhall is a fork of Heorot. Only the user-facing name changed: Matrix event types (com.heorot.*, org.heorot.*),
// storage keys and the heorot:// desktop origin keep their names for compatibility with Heorot clients and data.
export const DEFAULT_BRAND = "Meadhall";

// AGPL-3.0 section 13: users of a hosted copy must be offered its source. Deployers running a modified copy set
// `source_code_url` in config.json to where their modified source is published.
export const DEFAULT_SOURCE_CODE_URL = "https://github.com/PeytonG/Meadhall";

export function getSourceCodeUrl(config: CoreConfig | null | undefined): string {
    const url = typeof config?.source_code_url === "string" ? config.source_code_url.trim() : "";
    return /^https?:\/\//.test(url) ? url : DEFAULT_SOURCE_CODE_URL;
}

export function getBrandName(config: CoreConfig | null | undefined): string {
    const brand = typeof config?.brand === "string" ? config.brand.trim() : "";
    return brand.length > 0 ? brand : DEFAULT_BRAND;
}

// Shown to other clients (e.g. Element's session list) for sessions this app creates.
export function getDeviceDisplayName(config: CoreConfig | null | undefined, isDesktop: boolean): string {
    return `${getBrandName(config)} ${isDesktop ? "Desktop" : "Web"}`;
}
