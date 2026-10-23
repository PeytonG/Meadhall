// SPDX-License-Identifier: AGPL-3.0-only
// Profile banner, About me, public email and links (Settings → Profile). Saved as extended-profile fields.
import React, { useEffect, useRef, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { mediaFromMxc } from "../../../adapters/media";
import { BannerImage } from "../../../components/rightPanel/BannerImage";
import type { ToastState } from "../../../components/Toast";
import {
    ABOUT_KEY,
    ABOUT_MAX_LENGTH,
    BANNER_CROP_KEY,
    BANNER_KEY,
    DEFAULT_BANNER_CROP,
    EMAIL_KEY,
    EMPTY_RICH_PROFILE,
    LINKS_KEY,
    MAX_LINKS,
    isPlausibleEmail,
    parseRichProfile,
    safeLinkUrl,
    type RichProfile,
} from "../../../../core/profile/richProfile";

interface ProfileDetailsProps {
    client: MatrixClient;
    onToast: (toast: Omit<ToastState, "id">) => void;
}

const BANNER_MAX_BYTES = 10 * 1024 * 1024;

export function ProfileDetails({ client, onToast }: ProfileDetailsProps): React.ReactElement {
    const userId = client.getUserId() ?? "";
    const bannerInputRef = useRef<HTMLInputElement | null>(null);
    const [saved, setSaved] = useState<RichProfile>(EMPTY_RICH_PROFILE);
    const [draft, setDraft] = useState<RichProfile>(EMPTY_RICH_PROFILE);
    const [linkDrafts, setLinkDrafts] = useState<Array<{ label: string; url: string }>>([]);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void client
            .getProfileInfo(userId)
            .then((info) => {
                if (cancelled) return;
                const parsed = parseRichProfile(info as Record<string, unknown>);
                setSaved(parsed);
                setDraft(parsed);
                setLinkDrafts(parsed.links.map((link) => ({ ...link })));
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [client, userId]);

    const uploadBanner = async (file: File): Promise<void> => {
        if (file.size > BANNER_MAX_BYTES) {
            setError("Banners can be up to 10 MB.");
            return;
        }
        setUploading(true);
        setError(null);
        try {
            const upload = await client.uploadContent(file, { includeFilename: true, type: file.type, name: file.name });
            // A new picture starts centred and unzoomed.
            setDraft((current) => ({ ...current, bannerMxc: upload.content_uri, bannerCrop: DEFAULT_BANNER_CROP }));
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Failed to upload the banner.");
        } finally {
            setUploading(false);
        }
    };

    const links = linkDrafts
        .filter((link) => link.url.trim())
        .map((link) => ({ label: link.label.trim(), url: safeLinkUrl(link.url) }));
    const badLink = links.some((link) => !link.url);
    const badEmail = draft.email.trim() !== "" && !isPlausibleEmail(draft.email);
    const nextLinks = links
        .filter((link): link is { label: string; url: string } => Boolean(link.url))
        .map((link) => ({ label: link.label || new URL(link.url).hostname, url: link.url }));
    const changed =
        draft.bannerMxc !== saved.bannerMxc ||
        JSON.stringify(draft.bannerCrop) !== JSON.stringify(saved.bannerCrop) ||
        draft.about.trim() !== saved.about ||
        draft.email.trim() !== saved.email ||
        JSON.stringify(nextLinks) !== JSON.stringify(saved.links);

    const save = async (): Promise<void> => {
        setSaving(true);
        setError(null);
        // Empty fields are removed from the profile rather than saved blank.
        const write = async (key: string, value: unknown, empty: boolean): Promise<void> =>
            empty ? client.deleteExtendedProfileProperty(key) : client.setExtendedProfileProperty(key, value);
        try {
            if (draft.bannerMxc !== saved.bannerMxc) await write(BANNER_KEY, draft.bannerMxc, !draft.bannerMxc);
            if (JSON.stringify(draft.bannerCrop) !== JSON.stringify(saved.bannerCrop)) {
                await write(BANNER_CROP_KEY, draft.bannerCrop, false);
            }
            if (draft.about.trim() !== saved.about) await write(ABOUT_KEY, draft.about.trim(), !draft.about.trim());
            if (draft.email.trim() !== saved.email) await write(EMAIL_KEY, draft.email.trim(), !draft.email.trim());
            if (JSON.stringify(nextLinks) !== JSON.stringify(saved.links)) await write(LINKS_KEY, nextLinks, nextLinks.length === 0);
            const next = { bannerMxc: draft.bannerMxc, bannerCrop: draft.bannerCrop, about: draft.about.trim(), email: draft.email.trim(), links: nextLinks };
            setSaved(next);
            setDraft(next);
            setLinkDrafts(nextLinks.map((link) => ({ ...link })));
            onToast({ type: "success", message: "Profile details saved." });
        } catch (saveError) {
            setError(
                saveError instanceof Error && /extended profiles/i.test(saveError.message)
                    ? "Your server doesn't support profile details yet (it needs Matrix extended profiles)."
                    : saveError instanceof Error
                      ? saveError.message
                      : "Failed to save profile details.",
            );
        } finally {
            setSaving(false);
        }
    };

    const bannerUrl = draft.bannerMxc ? mediaFromMxc(client, draft.bannerMxc) : null;

    return (
        <div className="settings-section-card settings-profile-details" data-testid="profile-details">
            <h3>Banner</h3>
            {/* Exactly the profile card's banner shape and crop. Drag to choose what shows; zoom to fill. The full
                file is used (not a thumbnail) so GIFs keep moving. */}
            <div
                className={`settings-banner-preview profile-banner-shape${bannerUrl ? " is-croppable" : ""}`}
                data-testid="banner-preview"
                onPointerDown={(event) => {
                    if (!bannerUrl) return;
                    const box = event.currentTarget.getBoundingClientRect();
                    const start = { x: event.clientX, y: event.clientY, crop: draft.bannerCrop };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const move = (moveEvent: PointerEvent): void => {
                        // Dragging the picture right shows more of its left side, like moving a photo in a frame.
                        const dx = ((moveEvent.clientX - start.x) / box.width) * 100;
                        const dy = ((moveEvent.clientY - start.y) / box.height) * 100;
                        const clamp = (value: number): number => Math.min(100, Math.max(0, Math.round(value)));
                        setDraft((current) => ({
                            ...current,
                            bannerCrop: { ...start.crop, x: clamp(start.crop.x - dx), y: clamp(start.crop.y - dy) },
                        }));
                    };
                    const up = (): void => {
                        window.removeEventListener("pointermove", move);
                        window.removeEventListener("pointerup", up);
                    };
                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", up);
                }}
            >
                {bannerUrl ? (
                    <BannerImage url={bannerUrl} crop={draft.bannerCrop} />
                ) : (
                    <span>No banner: a color from your name is used.</span>
                )}
            </div>
            {bannerUrl ? (
                <div className="settings-banner-crop">
                    <label>
                        <span>Zoom</span>
                        <input
                            type="range"
                            min={1}
                            max={4}
                            step={0.05}
                            value={draft.bannerCrop.zoom}
                            aria-label="Banner zoom"
                            data-testid="banner-zoom"
                            onChange={(event) =>
                                setDraft((current) => ({ ...current, bannerCrop: { ...current.bannerCrop, zoom: Number(event.target.value) } }))
                            }
                        />
                    </label>
                    <button
                        type="button"
                        className="settings-button settings-button-secondary"
                        onClick={() => setDraft((current) => ({ ...current, bannerCrop: DEFAULT_BANNER_CROP }))}
                    >
                        Reset crop
                    </button>
                </div>
            ) : null}
            <div className="settings-profile-actions">
                <button type="button" className="settings-button" disabled={uploading} onClick={() => bannerInputRef.current?.click()}>
                    {uploading ? "Uploading..." : "Upload banner"}
                </button>
                <button
                    type="button"
                    className="settings-button settings-button-secondary"
                    disabled={!draft.bannerMxc}
                    onClick={() => setDraft((current) => ({ ...current, bannerMxc: null }))}
                >
                    Remove banner
                </button>
                <input
                    ref={bannerInputRef}
                    className="settings-hidden-input"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    data-testid="banner-input"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadBanner(file);
                        event.currentTarget.value = "";
                    }}
                />
            </div>
            <p className="settings-field-help">
                An image or GIF across the top of your profile. The preview is exactly how it shows on your profile card: drag
                it to choose what shows, and zoom in if it doesn&apos;t fill the space.
            </p>

            <label className="settings-field">
                <span>About me</span>
                <textarea
                    rows={4}
                    maxLength={ABOUT_MAX_LENGTH}
                    value={draft.about}
                    onChange={(event) => setDraft((current) => ({ ...current, about: event.target.value }))}
                    placeholder="Tell people a little about yourself"
                />
                <small className="settings-field-help">
                    {draft.about.length}/{ABOUT_MAX_LENGTH}
                </small>
            </label>

            <label className="settings-field">
                <span>Email on your profile</span>
                <input
                    type="email"
                    value={draft.email}
                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                    placeholder="you@example.org"
                />
                <small className={badEmail ? "settings-inline-error" : "settings-field-help"}>
                    {badEmail
                        ? "That doesn't look like an email address."
                        : "Public: anyone who can see your profile can read it. This is separate from your account's sign-in email."}
                </small>
            </label>

            <fieldset className="settings-links">
                <legend>Links</legend>
                {linkDrafts.map((link, index) => (
                    <div className="settings-link-row" key={index}>
                        <input
                            type="text"
                            aria-label={`Link ${index + 1} name`}
                            placeholder="Name (GitHub, YouTube...)"
                            value={link.label}
                            maxLength={40}
                            onChange={(event) =>
                                setLinkDrafts((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))
                            }
                        />
                        <input
                            type="url"
                            aria-label={`Link ${index + 1} address`}
                            placeholder="https://..."
                            value={link.url}
                            onChange={(event) =>
                                setLinkDrafts((current) => current.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)))
                            }
                        />
                        <button
                            type="button"
                            className="settings-button settings-button-secondary"
                            aria-label={`Remove link ${index + 1}`}
                            onClick={() => setLinkDrafts((current) => current.filter((_, i) => i !== index))}
                        >
                            Remove
                        </button>
                    </div>
                ))}
                {linkDrafts.length < MAX_LINKS ? (
                    <button
                        type="button"
                        className="settings-button settings-button-secondary"
                        onClick={() => setLinkDrafts((current) => [...current, { label: "", url: "" }])}
                    >
                        Add link
                    </button>
                ) : null}
                {badLink ? <p className="settings-inline-error">Links must be web addresses (https://...).</p> : null}
            </fieldset>

            {error ? <p className="settings-inline-error">{error}</p> : null}
            <div className="settings-actions-row">
                <button
                    type="button"
                    className="settings-button"
                    disabled={!changed || saving || uploading || badLink || badEmail}
                    onClick={() => void save()}
                >
                    {saving ? "Saving..." : "Save details"}
                </button>
            </div>
        </div>
    );
}
