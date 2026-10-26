import React, { useEffect, useState } from "react";
import { LANGUAGES, chosenLanguage, setLanguage, t, useLanguage } from "../../../i18n";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { PixelColorWheel } from "../../../theme/PixelColorWheel";
import { StyleProfilesSection } from "./StyleProfilesSection";
import { FontPicker } from "./FontPicker";
import type { AppearanceSettings } from "../settingsStore";

const CHAT_LINE_LENGTH_MIN_CH = 45;
const CHAT_LINE_LENGTH_MAX_CH = 120;
const CHAT_LINE_LENGTH_PREVIEW_BODY =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus porttitor, nibh at gravida tristique, est arcu lacinia velit, sed efficitur justo sem vel mauris.";

interface AppearanceTabProps {
    settings: AppearanceSettings;
    renderReactionImages: boolean;
    onToggleRenderReactionImages: (enabled: boolean) => void;
    onChange: (settings: AppearanceSettings) => void;
    // For style profiles (saved in your account).
    client?: MatrixClient | null;
}

// The app's language (saved on this device; also on the sign-in screen). Not every screen is translated yet.
function LanguageCard(): React.ReactElement {
    useLanguage();
    return (
        <div className="settings-section-card">
            <h3>{t("Language")}</h3>
            <select className="settings-select" value={chosenLanguage()} onChange={(event) => setLanguage(event.target.value)} data-testid="language-select">
                <option value="system">{t("System default")}</option>
                {LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>
                        {language.name}
                    </option>
                ))}
            </select>
            <p className="settings-field-help">Translations cover sign-in, settings, the message box and call controls so far; the rest is still English.</p>
        </div>
    );
}

export function AppearanceTab({
    settings,
    renderReactionImages,
    onToggleRenderReactionImages,
    onChange,
    client,
}: AppearanceTabProps): React.ReactElement {
    const isDesktopRuntime = typeof window !== "undefined" && Boolean(window.heorotDesktop);
    // Start-at-login lives in the OS (owned by the desktop main process), not in local settings.
    const [startAtLogin, setStartAtLogin] = useState<boolean | null>(null);
    useEffect(() => {
        const getStartAtLogin = window.heorotDesktop?.getStartAtLogin;
        if (!getStartAtLogin) {
            return;
        }
        let cancelled = false;
        void getStartAtLogin().then((enabled) => {
            if (!cancelled) {
                setStartAtLogin(enabled);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);
    const useMaximumLineWidth = settings.chatLineLengthCh === 0;
    const effectiveLineLengthCh = useMaximumLineWidth
        ? CHAT_LINE_LENGTH_MAX_CH
        : Math.max(CHAT_LINE_LENGTH_MIN_CH, Math.min(CHAT_LINE_LENGTH_MAX_CH, settings.chatLineLengthCh));
    const previewStyle: React.CSSProperties | undefined = useMaximumLineWidth
        ? undefined
        : ({
              ["--settings-chat-preview-max-width" as "--settings-chat-preview-max-width"]: `${effectiveLineLengthCh}ch`,
          } as React.CSSProperties);

    return (
        <div className="settings-tab">
            <h2 className="settings-tab-title">Appearance</h2>
            <p className="settings-tab-description">How Meadhall looks on this device. Save looks as style profiles to switch between them or share them.</p>
            {client ? <StyleProfilesSection client={client} settings={settings} onChange={onChange} /> : null}

            <div className="settings-section-card">
                <h3>Theme</h3>
                <div className="settings-theme-row">
                    <button
                        type="button"
                        className={`settings-theme-button${settings.theme === "dark" ? " is-active" : ""}`}
                        onClick={() => onChange({ ...settings, theme: "dark" })}
                    >
                        Dark
                    </button>
                    <button
                        type="button"
                        className={`settings-theme-button${settings.theme === "light" ? " is-active" : ""}`}
                        onClick={() => onChange({ ...settings, theme: "light" })}
                    >
                        Light
                    </button>
                    <button
                        type="button"
                        className={`settings-theme-button${settings.theme === "contrast" ? " is-active" : ""}`}
                        onClick={() => onChange({ ...settings, theme: "contrast" })}
                    >
                        High contrast
                    </button>
                </div>
                {settings.theme === "contrast" ? (
                    <p className="settings-field-help">
                        Black background, white text and bold outlines. Your accent color is brightened until it is easy
                        to read.
                    </p>
                ) : null}
            </div>

            <FontPicker settings={settings} onChange={onChange} />

            <div className="settings-section-card">
                <h3>Icons</h3>
                <div className="settings-theme-row" role="radiogroup" aria-label="Icon style">
                    {(["pixel", "smooth"] as const).map((style) => (
                        <button
                            key={style}
                            type="button"
                            role="radio"
                            aria-checked={settings.iconStyle === style}
                            className={`settings-theme-button${settings.iconStyle === style ? " is-active" : ""}`}
                            onClick={() => onChange({ ...settings, iconStyle: style })}
                        >
                            {style === "pixel" ? "Pixel" : "Smooth"}
                        </button>
                    ))}
                </div>
                <p className="settings-field-help">The buttons and controls: pixel art to match the theme, or smooth lines.</p>
            </div>

            <LanguageCard />

            <div className="settings-section-card">
                <h3>Motion</h3>
                <label className="settings-toggle">
                    <input
                        type="checkbox"
                        checked={settings.reduceMotion}
                        onChange={(event) => onChange({ ...settings, reduceMotion: event.target.checked })}
                        data-testid="reduce-motion-toggle"
                    />
                    Reduce motion: still campfires, banners and GIF profile art, no sliding or popping animations
                </label>
                <p className="settings-field-help">Always on when your system asks for reduced motion.</p>
            </div>

            <div className="settings-section-card">
                <h3>Emoji</h3>
                <label className="settings-toggle">
                    <input
                        type="checkbox"
                        checked={settings.pixelEmoji}
                        onChange={(event) => onChange({ ...settings, pixelEmoji: event.target.checked })}
                        data-testid="pixel-emoji-toggle"
                    />
                    Pixel emoji (draw emoji as pixel art, to match the theme)
                </label>
            </div>

            <div className="settings-section-card">
                <h3>Theme color</h3>
                <p className="settings-tab-description">Pick any color; it's adjusted to stay readable in light and dark themes.</p>
                <PixelColorWheel
                    value={settings.accentColor}
                    onChange={(accentColor) => onChange({ ...settings, accentColor })}
                />
            </div>

            <div className="settings-section-card settings-chat-width-card">
                <h3>Chat line width</h3>
                <div className="settings-chat-width-preview">
                    <div className="settings-chat-preview-event" style={previewStyle}>
                        <span className="settings-chat-preview-avatar" aria-hidden="true">
                            V
                        </span>
                        <div className="settings-chat-preview-main">
                            <div className="settings-chat-preview-header">
                                <span className="settings-chat-preview-name">Vitosi</span>
                                <span className="settings-chat-preview-time">08:34</span>
                            </div>
                            <p className="settings-chat-preview-body">{CHAT_LINE_LENGTH_PREVIEW_BODY}</p>
                        </div>
                    </div>
                </div>
                <label className="settings-toggle">
                    <input
                        type="checkbox"
                        checked={useMaximumLineWidth}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                chatLineLengthCh: event.target.checked ? 0 : CHAT_LINE_LENGTH_MAX_CH,
                            })
                        }
                    />
                    Use maximum width (current behavior)
                </label>
                <div className="settings-chat-width-slider-row">
                    <span className="settings-chat-width-slider-label">
                        {useMaximumLineWidth ? "Maximum" : `${effectiveLineLengthCh} ch`}
                    </span>
                    <input
                        type="range"
                        className="settings-chat-width-slider"
                        min={CHAT_LINE_LENGTH_MIN_CH}
                        max={CHAT_LINE_LENGTH_MAX_CH}
                        step={1}
                        value={effectiveLineLengthCh}
                        disabled={useMaximumLineWidth}
                        onChange={(event) => {
                            const parsedValue = Number.parseInt(event.target.value, 10);
                            if (!Number.isFinite(parsedValue)) {
                                return;
                            }
                            onChange({
                                ...settings,
                                chatLineLengthCh: Math.max(
                                    CHAT_LINE_LENGTH_MIN_CH,
                                    Math.min(CHAT_LINE_LENGTH_MAX_CH, parsedValue),
                                ),
                            });
                        }}
                    />
                    <div className="settings-chat-width-scale">
                        <span>{CHAT_LINE_LENGTH_MIN_CH} ch</span>
                        <span>{CHAT_LINE_LENGTH_MAX_CH} ch</span>
                    </div>
                </div>
            </div>
            <p className="settings-inline-note">Limits only message text width. The timeline keeps wrapping on word boundaries.</p>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.compactMode}
                    onChange={(event) => onChange({ ...settings, compactMode: event.target.checked })}
                />
                Compact mode (higher message density)
            </label>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.showTimestamps}
                    onChange={(event) => onChange({ ...settings, showTimestamps: event.target.checked })}
                />
                Show timestamps in timeline
            </label>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.showSpaceChannelAvatars}
                    onChange={(event) =>
                        onChange({
                            ...settings,
                            showSpaceChannelAvatars: event.target.checked,
                        })
                    }
                />
                Show avatars in Space channels list
            </label>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={renderReactionImages}
                    onChange={(event) => onToggleRenderReactionImages(event.target.checked)}
                />
                Render reaction images
            </label>
            {isDesktopRuntime ? (
                <label className="settings-toggle">
                    <input
                        type="checkbox"
                        checked={settings.closeOnWindowCloseMinimize}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                closeOnWindowCloseMinimize: event.target.checked,
                            })
                        }
                    />
                    Close button keeps app running in the tray (desktop)
                </label>
            ) : null}
            {isDesktopRuntime && startAtLogin !== null ? (
                <label className="settings-toggle">
                    <input
                        type="checkbox"
                        checked={startAtLogin}
                        onChange={(event) => {
                            void window.heorotDesktop?.setStartAtLogin?.(event.target.checked).then(setStartAtLogin);
                        }}
                    />
                    Open in the background when you sign in to your computer (desktop)
                </label>
            ) : null}
        </div>
    );
}
