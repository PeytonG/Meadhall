// SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useRef, useState } from "react";

import { STICKERS, type Sticker } from "./stickerPack";

interface StickerButtonProps {
    disabled: boolean;
    onSend: (sticker: Sticker) => Promise<void>;
}

// Composer button that opens the pixel sticker picker; picking a sticker sends it straight away.
export function StickerButton({ disabled, onSend }: StickerButtonProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [sending, setSending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const anchorRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const close = (event: Event): void => {
            if (event instanceof KeyboardEvent ? event.key === "Escape" : !anchorRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", close);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", close);
        };
    }, [open]);

    const send = (sticker: Sticker): void => {
        setSending(sticker.id);
        setError(null);
        void onSend(sticker)
            .then(() => setOpen(false))
            .catch((sendError: unknown) => setError(sendError instanceof Error ? sendError.message : "Couldn't send the sticker."))
            .finally(() => setSending(null));
    };

    return (
        <div className="composer-sticker-anchor" ref={anchorRef}>
            <button
                type="button"
                className="composer-action-button composer-sticker-button"
                onClick={() => setOpen((current) => !current)}
                disabled={disabled}
                aria-label="Open sticker picker"
                aria-expanded={open}
                title="Stickers"
            >
                <img src={STICKERS[0]?.url} alt="" />
            </button>
            {open ? (
                <div className="sticker-picker" role="dialog" aria-label="Stickers">
                    <div className="sticker-picker-title">Stickers</div>
                    <div className="sticker-picker-grid">
                        {STICKERS.map((sticker) => (
                            <button
                                key={sticker.id}
                                type="button"
                                className="sticker-picker-item"
                                title={sticker.name}
                                aria-label={`Send ${sticker.name} sticker`}
                                disabled={sending !== null}
                                onClick={() => send(sticker)}
                            >
                                <img src={sticker.url} alt="" />
                            </button>
                        ))}
                    </div>
                    {error ? <p className="sticker-picker-error">{error}</p> : null}
                </div>
            ) : null}
        </div>
    );
}
