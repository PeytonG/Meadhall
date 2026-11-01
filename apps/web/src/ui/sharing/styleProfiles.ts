// SPDX-License-Identifier: AGPL-3.0-only
// Style profiles (Settings → Appearance): saved sets of appearance settings (theme, accent, fonts, icons...) and your
// card gradient and nameplate, to switch between or share. Kept in account data, so they follow you to every device.
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { parseProfileStyle, type ProfileStyle } from "../../core/profile/profileStyle";
import { cleanStyleSettings, type SharedStyle, type StyleSettings } from "../../core/sharing/meadhallFile";
import type { AppearanceSettings } from "../settings/user/settingsStore";

export const STYLE_PROFILES_TYPE = "io.github.peytong.meadhall.style_profiles";
export const MAX_STYLE_PROFILES = 20;

export interface StyleProfile {
    id: string;
    name: string;
    appearance: StyleSettings;
    profileStyle: ProfileStyle | null;
    // The share it was adopted from (see CustomSound.source).
    source?: string;
}

export function readStyleProfiles(client: MatrixClient): StyleProfile[] {
    const profiles = client.getAccountData(STYLE_PROFILES_TYPE as never)?.getContent()?.profiles;
    if (!Array.isArray(profiles)) return [];
    return profiles
        .filter((profile): profile is Record<string, unknown> => Boolean(profile) && typeof profile === "object")
        .map((profile) => ({
            id: typeof profile.id === "string" ? profile.id : "",
            name: typeof profile.name === "string" ? profile.name.slice(0, 32) : "Style",
            appearance: cleanStyleSettings(profile.appearance),
            profileStyle: profile.profileStyle ? parseProfileStyle(profile.profileStyle) : null,
            ...(typeof profile.source === "string" ? { source: profile.source } : {}),
        }))
        .filter((profile) => profile.id)
        .slice(0, MAX_STYLE_PROFILES);
}

async function writeStyleProfiles(client: MatrixClient, profiles: StyleProfile[]): Promise<void> {
    await client.setAccountData(STYLE_PROFILES_TYPE as never, { profiles } as never);
}

export function appearanceToStyle(settings: AppearanceSettings): StyleSettings {
    return cleanStyleSettings(settings);
}

export async function addStyleProfile(
    client: MatrixClient,
    name: string,
    appearance: StyleSettings,
    profileStyle: ProfileStyle | null,
    source?: string,
): Promise<StyleProfile> {
    const profiles = readStyleProfiles(client);
    if (profiles.length >= MAX_STYLE_PROFILES) throw new Error(`You can keep up to ${MAX_STYLE_PROFILES} style profiles.`);
    const taken = new Set(profiles.map((profile) => profile.name));
    let unique = name.trim().slice(0, 32) || "Style";
    for (let index = 2; taken.has(unique); index += 1) unique = `${name.trim().slice(0, 28) || "Style"} ${index}`;
    const profile: StyleProfile = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: unique,
        appearance: cleanStyleSettings(appearance),
        profileStyle: profileStyle && (profileStyle.card || profileStyle.nameplate) ? profileStyle : null,
        ...(source ? { source } : {}),
    };
    await writeStyleProfiles(client, [...profiles, profile]);
    return profile;
}

export async function removeStyleProfile(client: MatrixClient, id: string): Promise<void> {
    await writeStyleProfiles(client, readStyleProfiles(client).filter((profile) => profile.id !== id));
}

export function styleProfileToShare(profile: StyleProfile): SharedStyle {
    return { kind: "style", name: profile.name, appearance: profile.appearance, ...(profile.profileStyle ? { profileStyle: profile.profileStyle } : {}) };
}

export async function adoptSharedStyle(client: MatrixClient, shared: SharedStyle, source?: string): Promise<StyleProfile> {
    return addStyleProfile(client, shared.name, shared.appearance, shared.profileStyle ? parseProfileStyle(shared.profileStyle) : null, source);
}
