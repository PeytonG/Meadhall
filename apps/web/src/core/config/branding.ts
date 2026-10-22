import type { CoreConfig } from "./configTypes";

// Meadhall is a fork of Heorot. Only the user-facing name changed: Matrix event types (com.heorot.*, org.heorot.*),
// storage keys and the heorot:// desktop origin keep their names for compatibility with Heorot clients and data.
export const DEFAULT_BRAND = "Meadhall";

export function getBrandName(config: CoreConfig | null | undefined): string {
    const brand = typeof config?.brand === "string" ? config.brand.trim() : "";
    return brand.length > 0 ? brand : DEFAULT_BRAND;
}

// Shown to other clients (e.g. Element's session list) for sessions this app creates.
export function getDeviceDisplayName(config: CoreConfig | null | undefined, isDesktop: boolean): string {
    return `${getBrandName(config)} ${isDesktop ? "Desktop" : "Web"}`;
}
