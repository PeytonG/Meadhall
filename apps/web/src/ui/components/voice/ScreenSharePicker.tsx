// SPDX-License-Identifier: AGPL-3.0-only
// Desktop app: choose what to share, with a live-ish preview of each screen and window (like Discord's picker).
import React from "react";

import type { HeorotDesktopCaptureSource } from "../../types/heorotDesktop";

interface ScreenSharePickerProps {
    sources: HeorotDesktopCaptureSource[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onConfirm: () => void;
    // Previews are still being captured (they arrive a moment after the list).
    previewsLoading?: boolean;
}

function SourceCard({
    source,
    selected,
    onSelect,
    onConfirm,
    previewLoading,
}: {
    source: HeorotDesktopCaptureSource;
    selected: boolean;
    previewLoading: boolean;
    onSelect: () => void;
    onConfirm: () => void;
}): React.ReactElement {
    return (
        <button
            type="button"
            className={`screen-share-source${selected ? " is-selected" : ""}`}
            onClick={onSelect}
            onDoubleClick={onConfirm}
            aria-pressed={selected}
            data-testid="screen-share-source"
        >
            <span className="screen-share-source-preview">
                {source.thumbnail ? <img src={source.thumbnail} alt="" /> : <span className={`screen-share-source-empty${previewLoading ? " is-loading" : ""}`}>{previewLoading ? "Loading preview…" : "No preview"}</span>}
            </span>
            <span className="screen-share-source-label">
                {source.icon ? <img className="screen-share-source-icon" src={source.icon} alt="" /> : null}
                <span className="screen-share-source-name" title={source.name}>
                    {source.name}
                </span>
            </span>
        </button>
    );
}

export function ScreenSharePicker({ sources, selectedId, onSelect, onConfirm, previewsLoading = false }: ScreenSharePickerProps): React.ReactElement {
    const screens = sources.filter((source) => source.kind === "screen" || source.id.startsWith("screen:"));
    const windows = sources.filter((source) => !screens.includes(source));
    const section = (title: string, items: HeorotDesktopCaptureSource[]): React.ReactElement | null =>
        items.length === 0 ? null : (
            <section className="screen-share-section" aria-label={title}>
                <h4>{title}</h4>
                <div className="screen-share-grid">
                    {items.map((source) => (
                        <SourceCard
                            key={source.id}
                            source={source}
                            selected={source.id === selectedId}
                            previewLoading={previewsLoading}
                            onSelect={() => onSelect(source.id)}
                            onConfirm={() => {
                                onSelect(source.id);
                                onConfirm();
                            }}
                        />
                    ))}
                </div>
            </section>
        );
    return (
        <div className="screen-share-picker" data-testid="screen-share-picker">
            {section("Screens", screens)}
            {section("Windows", windows)}
            {sources.length === 0 ? <p className="settings-inline-note">Nothing to share was found.</p> : null}
        </div>
    );
}
