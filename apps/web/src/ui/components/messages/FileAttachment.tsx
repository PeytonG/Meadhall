// SPDX-License-Identifier: AGPL-3.0-only
// An attached file in the chat, like Discord's: its type, name and size with a Download button. PDFs show their first
// page and page count, text and code files their first lines (Expand for more); clicking a PDF, Word document or
// text file opens it in FileViewer.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { openPdf, renderPdfPage } from "../../adapters/documents";
import { PixelIcon } from "../PixelIcon";
import { DOCUMENT_PREVIEW_MAX_BYTES, fileBadge, fileKind, TEXT_PREVIEW_MAX_BYTES } from "./fileKinds";
import { FileViewer } from "./FileViewer";

interface FileAttachmentProps {
    name: string;
    mimeType?: string | null;
    // Bytes, when the sender said (content.info.size).
    size?: number | null;
    sizeLabel?: string | null;
    grouped?: boolean;
    // Fetches the file (decrypted in encrypted rooms).
    fetchFile: () => Promise<Blob>;
    onDownload: () => void;
}

const COLLAPSED_LINES = 6;
const EXPANDED_LINES = 60;

// Runs `start` once the element scrolls near the screen (previews don't download files nobody looks at).
function useWhenVisible(start: () => void): React.RefObject<HTMLDivElement | null> {
    const ref = useRef<HTMLDivElement | null>(null);
    const started = useRef(false);
    useEffect(() => {
        const element = ref.current;
        if (!element || started.current) return undefined;
        const observer = new IntersectionObserver((entries) => {
            if (!started.current && entries.some((entry) => entry.isIntersecting)) {
                started.current = true;
                start();
                observer.disconnect();
            }
        }, { rootMargin: "200px 0px" });
        observer.observe(element);
        return () => observer.disconnect();
    }, [start]);
    return ref;
}

export function FileAttachment({ name, mimeType, size, sizeLabel, grouped, fetchFile, onDownload }: FileAttachmentProps): React.ReactElement {
    const kind = fileKind(name, mimeType);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [pages, setPages] = useState<number | null>(null);
    const [lines, setLines] = useState<string[] | null>(null);
    const [expanded, setExpanded] = useState(false);
    const thumbnailRef = useRef<HTMLCanvasElement | null>(null);
    const blobRef = useRef<Promise<Blob> | null>(null);

    // One download per card, shared by the preview, the viewer and nothing else (Download fetches its own copy).
    // The timeline passes a new fetchFile on every render; keep the latest without changing load (which would reload
    // the viewer and reset its zoom).
    const fetchFileRef = useRef(fetchFile);
    fetchFileRef.current = fetchFile;
    const load = useCallback((): Promise<Blob> => {
        blobRef.current ??= fetchFileRef.current();
        blobRef.current.catch(() => {
            blobRef.current = null;
        });
        return blobRef.current;
    }, []);

    const canPreviewInline =
        (kind === "pdf" && (size ?? 0) <= DOCUMENT_PREVIEW_MAX_BYTES) || (kind === "text" && (size ?? 0) <= TEXT_PREVIEW_MAX_BYTES * 4);
    const startPreview = useCallback(() => {
        if (!canPreviewInline) return;
        void (async () => {
            try {
                const blob = await load();
                if (kind === "pdf") {
                    const { pdf, close } = await openPdf(await blob.arrayBuffer());
                    setPages(pdf.numPages);
                    if (thumbnailRef.current) {
                        const page = await pdf.getPage(1);
                        const width = page.getViewport({ scale: 1 }).width;
                        await renderPdfPage(pdf, 1, thumbnailRef.current, 64 / width);
                    }
                    close();
                } else {
                    const text = await blob.slice(0, 64 * 1024).text();
                    setLines(text.replace(/\r\n/g, "\n").split("\n").slice(0, EXPANDED_LINES + 1));
                }
            } catch {
                // The card still works without a preview.
            }
        })();
    }, [canPreviewInline, kind, load]);
    const cardRef = useWhenVisible(startPreview);

    const opensViewer = kind !== "other";
    const meta = [kind === "pdf" ? "PDF" : kind === "docx" ? "Word document" : null, pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : null, sizeLabel]
        .filter(Boolean)
        .join(" · ");
    const shownLines = lines ? lines.slice(0, expanded ? EXPANDED_LINES : COLLAPSED_LINES) : null;
    const moreLines = lines ? lines.length > (expanded ? EXPANDED_LINES : COLLAPSED_LINES) : false;

    return (
        <div className={`timeline-file-card file-attachment${grouped ? " timeline-file-card-grouped" : ""}`} ref={cardRef} data-testid="file-attachment" data-kind={kind}>
            <div className="file-attachment-head">
                <button
                    type="button"
                    className="file-attachment-main"
                    onClick={() => (opensViewer ? setViewerOpen(true) : onDownload())}
                    title={opensViewer ? `Open ${name}` : `Download ${name}`}
                    data-testid="file-attachment-open"
                >
                    {kind === "pdf" ? (
                        <span className="file-attachment-thumb" aria-hidden="true">
                            <canvas ref={thumbnailRef} />
                            <span className="timeline-file-icon file-attachment-badge">PDF</span>
                        </span>
                    ) : (
                        <span className="timeline-file-icon" aria-hidden="true">
                            {fileBadge(name, kind)}
                        </span>
                    )}
                    <span className="timeline-file-content">
                        <span className="timeline-file-name" title={name}>
                            {name}
                        </span>
                        <span className="timeline-file-meta" data-testid="file-attachment-meta">
                            {meta}
                        </span>
                    </span>
                </button>
                <button type="button" className="file-attachment-download" onClick={onDownload} aria-label={`Download ${name}`} title="Download" data-testid="file-attachment-download">
                    <PixelIcon name="download" size={18} />
                </button>
            </div>
            {shownLines ? (
                <div className="file-attachment-text">
                    <pre data-testid="file-attachment-lines">{shownLines.join("\n")}</pre>
                    {moreLines || expanded ? (
                        <button type="button" className="file-attachment-expand" onClick={() => (moreLines && expanded ? setViewerOpen(true) : setExpanded((value) => !value))}>
                            {moreLines && expanded ? "View whole file" : expanded ? "Collapse" : "Expand"}
                        </button>
                    ) : null}
                </div>
            ) : null}
            {viewerOpen && kind !== "other"
                ? createPortal(<FileViewer name={name} kind={kind} load={load} onDownload={onDownload} onClose={() => setViewerOpen(false)} />, document.body)
                : null}
        </div>
    );
}
