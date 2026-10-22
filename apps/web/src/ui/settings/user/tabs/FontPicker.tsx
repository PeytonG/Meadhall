// SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useMemo, useState } from "react";

import { cssFontStack, listSystemFonts, type SystemFontList } from "../../../theme/systemFonts";
import type { AppearanceSettings, FontStyle } from "../settingsStore";

interface FontPickerProps {
    settings: AppearanceSettings;
    onChange: (settings: AppearanceSettings) => void;
}

const FONT_CHOICES: ReadonlyArray<readonly [FontStyle, string]> = [
    ["pixel", "Pixel"],
    ["mixed", "Pixel headings"],
    ["system", "System"],
    ["custom", "Other"],
];

export function FontPicker({ settings, onChange }: FontPickerProps): React.ReactElement {
    const [fontList, setFontList] = useState<SystemFontList | null>(null);
    const [filter, setFilter] = useState("");
    const isCustom = settings.fontStyle === "custom";

    // The installed-font list is only needed once "Other" is chosen.
    useEffect(() => {
        if (!isCustom || fontList) {
            return;
        }
        let cancelled = false;
        void listSystemFonts().then((list) => {
            if (!cancelled) {
                setFontList(list);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [fontList, isCustom]);

    const families = useMemo(() => {
        const all = fontList?.families ?? [];
        const query = filter.trim().toLowerCase();
        const matches = query ? all.filter((family) => family.toLowerCase().includes(query)) : all;
        // Keep the current choice selectable even when the filter hides it.
        return settings.customFontFamily && !matches.includes(settings.customFontFamily)
            ? [settings.customFontFamily, ...matches]
            : matches;
    }, [filter, fontList, settings.customFontFamily]);

    const choose = (fontStyle: FontStyle): void => {
        if (fontStyle !== "custom") {
            onChange({ ...settings, fontStyle });
            return;
        }
        onChange({
            ...settings,
            fontStyle,
            customFontFamily: settings.customFontFamily || fontList?.families[0] || "Segoe UI",
        });
    };

    return (
        <div className="settings-section-card">
            <h3>Font</h3>
            <div className="settings-theme-row settings-font-row" role="group" aria-label="Font">
                {FONT_CHOICES.map(([fontStyle, label]) => (
                    <button
                        key={fontStyle}
                        type="button"
                        className={`settings-theme-button${settings.fontStyle === fontStyle ? " is-active" : ""}`}
                        aria-pressed={settings.fontStyle === fontStyle}
                        onClick={() => choose(fontStyle)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {isCustom ? (
                <div className="settings-font-other">
                    <label className="settings-field">
                        Search fonts
                        <input
                            type="search"
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            placeholder="Type to filter"
                        />
                    </label>
                    <label className="settings-field">
                        Installed font
                        <select
                            value={settings.customFontFamily}
                            onChange={(event) => onChange({ ...settings, customFontFamily: event.target.value })}
                            data-testid="font-family-select"
                        >
                            {families.map((family) => (
                                <option key={family} value={family} style={{ fontFamily: cssFontStack(family) }}>
                                    {family}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p className="settings-tab-description">
                        {fontList === null
                            ? "Looking for installed fonts..."
                            : fontList.source === "local"
                              ? `${fontList.families.length} fonts installed on this device.`
                              : "Showing common fonts found on this device."}
                    </p>
                    <p className="settings-font-preview" style={{ fontFamily: cssFontStack(settings.customFontFamily) }}>
                        The mead is poured and the fire is lit. 0123456789
                    </p>
                </div>
            ) : null}
        </div>
    );
}
