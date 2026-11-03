import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { PixelIcon } from "../PixelIcon";

interface ComposerBarProps {
    disabled: boolean;
    dragActive: boolean;
    value: string;
    placeholder: string;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
    onChange: (value: string, caret: number | null) => void;
    onCursorActivity: (caret: number | null) => void;
    onBlur: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
    onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
    onAttach: () => void;
    // Phones: take a picture with the camera instead of picking one.
    onTakePhoto?: () => void;
    onToggleEmoji: () => void;
    emojiPicker: React.ReactNode;
    stickerControl?: React.ReactNode;
    // Phones have no Enter-to-send: a send button next to the emoji button (shown on touch/phone layouts by CSS).
    onSend?: () => void;
    canSend?: boolean;
    // Phones: "+" opens a menu with these (the poll and sticker buttons don't fit next to the text there).
    onCreatePoll?: () => void;
    onOpenStickers?: () => void;
}

export function ComposerBar({
    disabled,
    dragActive,
    value,
    placeholder,
    textareaRef,
    emojiButtonRef,
    onChange,
    onCursorActivity,
    onBlur,
    onKeyDown,
    onPaste,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onAttach,
    onTakePhoto,
    onToggleEmoji,
    emojiPicker,
    stickerControl,
    onSend,
    canSend = false,
    onCreatePoll,
    onOpenStickers,
}: ComposerBarProps): React.ReactElement {
    const isPhone = useMediaQuery("(max-width: 760px)");
    const hasMenu = isPhone && Boolean(onCreatePoll || onOpenStickers || onTakePhoto);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!menuOpen) return undefined;
        const close = (event: Event): void => {
            if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
        };
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", close);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", close);
        };
    }, [menuOpen]);
    // "+" is exactly as tall as the message box on one line (fonts, icon sizes and paddings differ by look and
    // platform, so it is measured rather than computed); when the box grows to more lines, "+" keeps that size.
    const shellRef = useRef<HTMLDivElement | null>(null);
    const [rowHeight, setRowHeight] = useState<number | null>(null);
    useLayoutEffect(() => {
        const shell = shellRef.current;
        if (!shell || value.includes("\n") || typeof ResizeObserver === "undefined") return undefined;
        const measure = (): void => {
            const height = Math.round(shell.getBoundingClientRect().height);
            if (height > 0) setRowHeight((current) => (current === null || !value || height < current ? height : current));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(shell);
        return () => observer.disconnect();
    }, [value]);
    const pick = (action?: () => void): void => {
        setMenuOpen(false);
        action?.();
    };
    return (
        <div className="composer-bar" style={rowHeight ? ({ "--composer-row-height": `${rowHeight}px` } as React.CSSProperties) : undefined}>
            <div className="composer-plus-anchor" ref={menuRef}>
                <button
                    type="button"
                    className="composer-plus-button"
                    onClick={hasMenu ? () => setMenuOpen((open) => !open) : onAttach}
                    disabled={disabled}
                    aria-label={hasMenu ? "Add a file, poll or sticker" : "Upload attachment"}
                    aria-haspopup={hasMenu ? "menu" : undefined}
                    aria-expanded={hasMenu ? menuOpen : undefined}
                    title={hasMenu ? "Add" : "Upload attachment"}
                    data-testid="composer-plus"
                >
                    {/* An icon, not a typed "+": a character sits on the font's baseline, off center in the box. */}
                    <PixelIcon name="plus" size={20} />
                </button>
                {hasMenu && menuOpen ? (
                    <div className="composer-plus-menu" role="menu" data-testid="composer-plus-menu">
                        {onTakePhoto ? (
                            <button type="button" role="menuitem" onClick={() => pick(onTakePhoto)} data-testid="composer-take-photo">
                                <PixelIcon name="camera" size={18} /> Take a photo
                            </button>
                        ) : null}
                        <button type="button" role="menuitem" onClick={() => pick(onAttach)}>
                            <span aria-hidden="true">📎</span> Upload a file
                        </button>
                        {onCreatePoll ? (
                            <button type="button" role="menuitem" onClick={() => pick(onCreatePoll)}>
                                <PixelIcon name="poll" size={18} /> Create a poll
                            </button>
                        ) : null}
                        {onOpenStickers ? (
                            <button type="button" role="menuitem" onClick={() => pick(onOpenStickers)}>
                                <span aria-hidden="true">🍺</span> Send a sticker
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <div
                ref={shellRef}
                className={`composer-input-shell${dragActive ? " is-drag-active" : ""}`}
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
            >
                <textarea
                    ref={textareaRef}
                    className="composer-textarea"
                    value={value}
                    onChange={(event) => onChange(event.target.value, event.target.selectionStart)}
                    onSelect={(event) => onCursorActivity(event.currentTarget.selectionStart)}
                    onClick={(event) => onCursorActivity(event.currentTarget.selectionStart)}
                    onKeyUp={(event) => onCursorActivity(event.currentTarget.selectionStart)}
                    onBlur={onBlur}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={1}
                />
                <div className="composer-input-actions">
                    {stickerControl}
                    <div className="composer-emoji-anchor">
                        <button
                            ref={emojiButtonRef}
                            type="button"
                            className="composer-action-button"
                            onClick={onToggleEmoji}
                            disabled={disabled}
                            aria-label="Open emoji picker"
                            title="Emoji"
                        >
                            {"\u{1F604}"}
                        </button>
                        {emojiPicker}
                    </div>
                    {onSend ? (
                        <button
                            type="button"
                            className="composer-action-button composer-send-button"
                            onMouseDown={(event) => event.preventDefault()} // keep the keyboard open
                            onClick={onSend}
                            disabled={disabled || !canSend}
                            aria-label="Send message"
                            title="Send"
                            data-testid="composer-send"
                        >
                            <PixelIcon name="send" size={18} />
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
