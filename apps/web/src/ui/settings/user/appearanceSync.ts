// SPDX-License-Identifier: AGPL-3.0-only
// Your look (theme, accent, fonts, icons, shapes, pixel emoji...) follows your account, so every device you sign in
// on looks the same. Kept in account data; a device applies it on sign-in and whenever another device changes it.
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { cleanStyleSettings, type StyleSettings } from "../../../core/sharing/meadhallFile";
import type { AppearanceSettings } from "./settingsStore";

export const APPEARANCE_TYPE = "io.github.peytong.meadhall.appearance";

// Layout stays per device (a phone and a wide monitor want different line lengths and density).
function syncedStyle(value: unknown): StyleSettings {
    const { compactMode: _compact, chatLineLengthCh: _lineLength, ...rest } = cleanStyleSettings(value);
    return rest;
}

// The look on the account, or null if none was ever chosen (then the sign-in look picker is offered).
export function readAccountAppearance(client: MatrixClient): StyleSettings | null {
    const content = client.getAccountData(APPEARANCE_TYPE as never)?.getContent();
    if (!content || typeof content !== "object" || !("appearance" in content)) return null;
    return syncedStyle((content as { appearance: unknown }).appearance);
}

export function writeAccountAppearance(client: MatrixClient, settings: AppearanceSettings): Promise<unknown> {
    return client.setAccountData(APPEARANCE_TYPE as never, { appearance: syncedStyle(settings) } as never);
}

// The synced parts of `settings` replaced by the account's, or `settings` itself when they already match.
export function withAccountAppearance(settings: AppearanceSettings, account: StyleSettings): AppearanceSettings {
    const merged = { ...settings, ...(account as Partial<AppearanceSettings>) };
    return sameAppearance(merged, settings) ? settings : merged;
}

export function sameAppearance(left: AppearanceSettings, right: AppearanceSettings): boolean {
    return JSON.stringify(syncedStyle(left)) === JSON.stringify(syncedStyle(right));
}

// The two looks the sign-in picker starts from; each part can then be switched on its own.
export type LookPart = "fontStyle" | "iconStyle" | "shapeStyle" | "pixelEmoji";

export function pixelLook(settings: AppearanceSettings, pixel: boolean): AppearanceSettings {
    return pixel
        ? { ...settings, fontStyle: "pixel", iconStyle: "pixel", shapeStyle: "pixel", pixelEmoji: true }
        : { ...settings, fontStyle: "system", iconStyle: "smooth", shapeStyle: "smooth", pixelEmoji: false };
}
