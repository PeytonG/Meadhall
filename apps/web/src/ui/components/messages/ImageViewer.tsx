// SPDX-License-Identifier: AGPL-3.0-only
// Full-size picture viewer (click a picture in the chat). Like Discord's: click to zoom in where you clicked, scroll
// to zoom, drag (or one finger) to move a zoomed picture, pinch on touch; a click without dragging zooms back out.
// The backdrop, the X and Escape close it.
import React, { useCallback, useEffect, useRef, useState } from "react";

import { PixelIcon } from "../PixelIcon";

interface ImageViewerProps {
    src: string;
    alt: string;
    onDownload: () => void;
    onClose: () => void;
}

interface View {
    scale: number;
    x: number;
    y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const CLICK_ZOOM = 2;
// Moving less than this between press and release counts as a click (zoom toggle), not a drag.
const DRAG_SLOP_PX = 4;
const AT_REST: View = { scale: 1, x: 0, y: 0 };

function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function ImageViewer({ src, alt, onDownload, onClose }: ImageViewerProps): React.ReactElement {
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [view, setView] = useState<View>(AT_REST);
    const [dragging, setDragging] = useState(false);
    const viewRef = useRef(view);
    // Events can come faster than renders (a pinch sends many moves): read and write the latest view here.
    const applyView = useCallback((next: View): void => {
        viewRef.current = next;
        setView(next);
    }, []);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<{ moved: boolean; startX: number; startY: number; pinchDistance: number | null }>({
        moved: false,
        startX: 0,
        startY: 0,
        pinchDistance: null,
    });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    useEffect(() => applyView(AT_REST), [applyView, src]);

    // Keep the picture's edges from moving past the window's edges (a picture smaller than the window stays centered).
    const clampView = useCallback((next: View): View => {
        const image = imageRef.current;
        if (!image || next.scale <= 1) {
            return AT_REST;
        }
        const width = image.offsetWidth * next.scale;
        const height = image.offsetHeight * next.scale;
        const maxX = Math.max(0, (width - window.innerWidth) / 2);
        const maxY = Math.max(0, (height - window.innerHeight) / 2);
        return {
            scale: next.scale,
            x: Math.min(maxX, Math.max(-maxX, next.x)),
            y: Math.min(maxY, Math.max(-maxY, next.y)),
        };
    }, []);

    // Zoom to `scale`, keeping the spot under the screen point (clientX, clientY) where it is.
    const zoomAt = useCallback(
        (scale: number, clientX: number, clientY: number): void => {
            const image = imageRef.current;
            const current = viewRef.current;
            if (!image) {
                return;
            }
            const nextScale = clampScale(scale);
            const rect = image.getBoundingClientRect();
            // Center of the picture before moving it (scaling around the center doesn't move it).
            const baseX = rect.left + rect.width / 2 - current.x;
            const baseY = rect.top + rect.height / 2 - current.y;
            const pointX = clientX - baseX;
            const pointY = clientY - baseY;
            const ratio = nextScale / current.scale;
            applyView(
                clampView({
                    scale: nextScale,
                    x: pointX - (pointX - current.x) * ratio,
                    y: pointY - (pointY - current.y) * ratio,
                }),
            );
        },
        [applyView, clampView],
    );

    const onPointerDown = (event: React.PointerEvent<HTMLImageElement>): void => {
        event.stopPropagation();
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // Not an active pointer (synthetic events): moves still arrive while over the picture.
        }
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 1) {
            gesture.current = { moved: false, startX: event.clientX, startY: event.clientY, pinchDistance: null };
        } else if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            gesture.current.pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            gesture.current.moved = true;
        }
    };

    const onPointerMove = (event: React.PointerEvent<HTMLImageElement>): void => {
        const previous = pointers.current.get(event.pointerId);
        if (!previous) {
            return;
        }
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.current.size >= 2 && gesture.current.pinchDistance) {
            const [a, b] = [...pointers.current.values()];
            const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            zoomAt(viewRef.current.scale * (distance / gesture.current.pinchDistance), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
            gesture.current.pinchDistance = distance;
            return;
        }

        if (
            !gesture.current.moved &&
            Math.hypot(event.clientX - gesture.current.startX, event.clientY - gesture.current.startY) > DRAG_SLOP_PX
        ) {
            gesture.current.moved = true;
        }
        if (gesture.current.moved && viewRef.current.scale > 1) {
            setDragging(true);
            const current = viewRef.current;
            applyView(
                clampView({
                    scale: current.scale,
                    x: current.x + event.clientX - previous.x,
                    y: current.y + event.clientY - previous.y,
                }),
            );
        }
    };

    const onPointerUp = (event: React.PointerEvent<HTMLImageElement>): void => {
        event.stopPropagation();
        if (!pointers.current.delete(event.pointerId)) {
            return;
        }
        if (pointers.current.size > 0) {
            return;
        }
        setDragging(false);
        if (!gesture.current.moved && event.type === "pointerup") {
            // A click: zoom in where it landed, or back out.
            if (viewRef.current.scale > 1) {
                applyView(AT_REST);
            } else {
                zoomAt(CLICK_ZOOM, event.clientX, event.clientY);
            }
        }
    };

    const onWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
        const factor = Math.exp(-event.deltaY * 0.0015);
        zoomAt(viewRef.current.scale * factor, event.clientX, event.clientY);
    };

    const zoomed = view.scale > 1;
    return (
        <div className="timeline-lightbox" role="dialog" aria-modal="true" aria-label="Image preview" onClick={onClose} onWheel={onWheel}>
            <div className="timeline-lightbox-actions">
                <button
                    type="button"
                    className="timeline-lightbox-button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onDownload();
                    }}
                    aria-label="Download"
                    title="Download"
                    data-testid="lightbox-download"
                >
                    <PixelIcon name="download" size={18} />
                </button>
                <button type="button" className="timeline-lightbox-button" onClick={onClose} aria-label="Close image preview">
                    {/* Drawn, not a typed "x": a letter sits on the font's baseline and is never quite centered. */}
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
            <img
                ref={imageRef}
                className={`timeline-lightbox-image${zoomed ? " is-zoomed" : ""}${dragging ? " is-panning" : ""}`}
                src={src}
                alt={alt}
                draggable={false}
                style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                data-scale={view.scale.toFixed(2)}
            />
        </div>
    );
}
