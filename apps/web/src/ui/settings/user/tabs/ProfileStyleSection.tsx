// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Profile → Profile style: a gradient for your profile card and a nameplate behind your name in member
// lists. Presets, or two colors of your own. Saved to your public profile straight away.
import React, { useEffect, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import {
    EMPTY_PROFILE_STYLE,
    GRADIENT_PRESETS,
    gradientColors,
    gradientCss,
    type GradientChoice,
    type GradientPreset,
    type ProfileStyle,
} from "../../../../core/profile/profileStyle";
import { useIconStyle } from "../../../theme/iconStyle";
import { readProfileStyle, saveOwnProfileStyle } from "../../../profile/useProfileStyle";

interface ProfileStyleSectionProps {
    client: MatrixClient;
    onToast: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

function sameChoice(left: GradientChoice | null, right: GradientChoice | null): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function GradientPicker({
    label,
    value,
    onChange,
    disabled,
}: {
    label: string;
    value: GradientChoice | null;
    onChange: (choice: GradientChoice | null) => void;
    disabled: boolean;
}): React.ReactElement {
    const pixel = useIconStyle() === "pixel";
    const custom = value && "colors" in value ? value.colors : null;
    const [from, setFrom] = useState(custom?.[0] ?? "#f5a623");
    const [to, setTo] = useState(custom?.[1] ?? "#1e1b4b");
    useEffect(() => {
        if (custom) {
            setFrom(custom[0]);
            setTo(custom[1]);
        }
    }, [custom?.[0], custom?.[1]]);
    return (
        <div className="profile-style-picker" role="radiogroup" aria-label={label}>
            <span className="profile-style-picker-label">{label}</span>
            <div className="profile-style-swatches">
                <button type="button" role="radio" aria-checked={value === null} aria-label="None" className={`profile-style-swatch is-none${value === null ? " is-active" : ""}`} onClick={() => onChange(null)} disabled={disabled}>
                    None
                </button>
                {(Object.keys(GRADIENT_PRESETS) as GradientPreset[]).map((preset) => {
                    const choice: GradientChoice = { preset };
                    return (
                        <button
                            key={preset}
                            type="button"
                            role="radio"
                            aria-checked={sameChoice(value, choice)}
                            aria-label={GRADIENT_PRESETS[preset].label}
                            title={GRADIENT_PRESETS[preset].label}
                            className={`profile-style-swatch${sameChoice(value, choice) ? " is-active" : ""}`}
                            style={{ background: gradientCss(gradientColors(choice)!, { pixel, bands: 4 }) }}
                            onClick={() => onChange(choice)}
                            disabled={disabled}
                        />
                    );
                })}
                <span className={`profile-style-custom${custom ? " is-active" : ""}`}>
                    <input type="color" aria-label={`${label}: first color`} value={from} onChange={(event) => setFrom(event.target.value)} disabled={disabled} />
                    <input type="color" aria-label={`${label}: second color`} value={to} onChange={(event) => setTo(event.target.value)} disabled={disabled} />
                    <button type="button" className="settings-button settings-button-secondary" onClick={() => onChange({ colors: [from, to] })} disabled={disabled}>
                        Use these
                    </button>
                </span>
            </div>
        </div>
    );
}

export function ProfileStyleSection({ client, onToast }: ProfileStyleSectionProps): React.ReactElement {
    const pixel = useIconStyle() === "pixel";
    const [style, setStyle] = useState<ProfileStyle>(EMPTY_PROFILE_STYLE);
    const [saving, setSaving] = useState(false);
    const name = client.getUser(client.getSafeUserId())?.displayName ?? client.getSafeUserId();

    useEffect(() => {
        let cancelled = false;
        void readProfileStyle(client, client.getSafeUserId()).then((value) => {
            if (!cancelled) setStyle(value);
        });
        return () => {
            cancelled = true;
        };
    }, [client]);

    const update = async (next: ProfileStyle): Promise<void> => {
        const previous = style;
        setStyle(next);
        setSaving(true);
        try {
            await saveOwnProfileStyle(client, next);
        } catch (error) {
            setStyle(previous);
            onToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't save your profile style." });
        } finally {
            setSaving(false);
        }
    };

    const card = gradientColors(style.card);
    const plate = gradientColors(style.nameplate);
    return (
        <div className="settings-section-card" data-testid="profile-style">
            <h3>Profile style</h3>
            <p className="settings-tab-description">Colors for your profile card, and a nameplate behind your name in member lists. Everyone can see them.</p>
            <div className="profile-style-preview">
                <div className="profile-style-preview-card" style={card ? { background: gradientCss(card, { pixel }) } : undefined}>
                    <strong>{name}</strong>
                    <span>Profile card</span>
                </div>
                <div className="profile-style-preview-plate" style={plate ? { background: gradientCss(plate, { pixel, angle: 90 }) } : undefined}>
                    {name}
                </div>
            </div>
            <GradientPicker label="Profile card" value={style.card} onChange={(choice) => void update({ ...style, card: choice })} disabled={saving} />
            <GradientPicker label="Nameplate" value={style.nameplate} onChange={(choice) => void update({ ...style, nameplate: choice })} disabled={saving} />
        </div>
    );
}
