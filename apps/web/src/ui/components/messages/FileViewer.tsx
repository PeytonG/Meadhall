// SPDX-License-Identifier: AGPL-3.0-only
// Full-screen preview of an attached document: PDF pages (zoom in and out, scroll through pages), Word documents
// (their text and formatting) and text or code files. Download is always at the top; the X, Escape and Android's
// Back close it.
import React, { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { docxToHtml, openPdf, renderPdfPage } from "../../adapters/documents";
import { CodeBlock } from "../../code/CodeBlock";
import { PixelIcon } from "../PixelIcon";
import { codeLanguage, TEXT_PREVIEW_MAX_BYTES, type FileKind } from "./fileKinds";
import { SafeHtml } from "./SafeHtml";

interface FileViewerProps {
    name: string;
    kind: Exclude<FileKind, "other">;
    // The file's bytes (fetched and, in encrypted rooms, decrypted by the caller).
    load: () => Promise<Blob>;
    onDownload: () => void;
    onClose: () => void;
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

function PdfPage({ pdf, pageNumber, scale }: { pdf: PDFDocumentProxy; pageNumber: number; scale: number }): React.ReactElement {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [visible, setVisible] = useState(pageNumber <= 2);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    // Pages draw when they scroll into view, so long PDFs open quickly.
    useEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap || visible) return undefined;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
        }, { rootMargin: "600px 0px" });
        observer.observe(wrap);
        return () => observer.disconnect();
    }, [visible]);

    useEffect(() => {
        if (!visible || !canvasRef.current) return;
        void renderPdfPage(pdf, pageNumber, canvasRef.current, scale).catch(() => undefined);
    }, [pdf, pageNumber, scale, visible]);

    return (
        <div className="file-viewer-page" ref={wrapRef} data-page={pageNumber} style={visible ? undefined : { minHeight: `${Math.round(1000 * scale)}px` }}>
            <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
        </div>
    );
}

export function FileViewer({ name, kind, load, onDownload, onClose }: FileViewerProps): React.ReactElement {
    const [error, setError] = useState<string | null>(null);
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
    const [html, setHtml] = useState<string | null>(null);
    const [text, setText] = useState<string | null>(null);
    // PDF zoom: starts fitting the window's width (at most 150%), then steps through ZOOMS.
    const [scale, setScale] = useState(1);
    const [truncated, setTruncated] = useState(false);
    const bodyRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    // Loads once per file (load may be a new function on each render).
    const loadRef = useRef(load);
    loadRef.current = load;
    useEffect(() => {
        let cancelled = false;
        let closePdf: (() => void) | null = null;
        void (async () => {
            try {
                const blob = await loadRef.current();
                if (kind === "pdf") {
                    const opened = await openPdf(await blob.arrayBuffer());
                    closePdf = opened.close;
                    if (cancelled) {
                        opened.close();
                        return;
                    }
                    const firstPage = await opened.pdf.getPage(1);
                    const pageWidth = firstPage.getViewport({ scale: 1 }).width;
                    const room = (bodyRef.current?.clientWidth ?? window.innerWidth) - 32;
                    if (!cancelled) {
                        setScale(Math.max(0.25, Math.min(1.5, room / pageWidth)));
                        setPdf(opened.pdf);
                    }
                } else if (kind === "docx") {
                    const converted = await docxToHtml(await blob.arrayBuffer());
                    if (!cancelled) setHtml(converted);
                } else {
                    const tooBig = blob.size > TEXT_PREVIEW_MAX_BYTES;
                    const content = await (tooBig ? blob.slice(0, TEXT_PREVIEW_MAX_BYTES) : blob).text();
                    if (!cancelled) {
                        setTruncated(tooBig);
                        setText(content);
                    }
                }
            } catch (failure) {
                if (!cancelled) setError(failure instanceof Error && failure.message ? `Couldn't open ${name}: ${failure.message}` : `Couldn't open ${name}.`);
            }
        })();
        return () => {
            cancelled = true;
            closePdf?.();
        };
    }, [kind, name]);

    const zoomOut = (): void => setScale((value) => [...ZOOMS].reverse().find((step) => step < value - 0.01) ?? value);
    const zoomIn = (): void => setScale((value) => ZOOMS.find((step) => step > value + 0.01) ?? value);
    const loading = !error && !pdf && html === null && text === null;
    return (
        <div className="file-viewer" role="dialog" aria-modal="true" aria-label={`Preview of ${name}`} data-testid="file-viewer">
            <div className="file-viewer-bar">
                <span className="file-viewer-name" title={name}>
                    {name}
                </span>
                {pdf ? (
                    <span className="file-viewer-zoom">
                        <span className="file-viewer-pages" data-testid="file-viewer-pages">
                            {pdf.numPages} {pdf.numPages === 1 ? "page" : "pages"}
                        </span>
                        <button type="button" className="file-viewer-button" onClick={zoomOut} disabled={scale <= ZOOMS[0]! + 0.01} aria-label="Zoom out" title="Zoom out">
                            −
                        </button>
                        <span className="file-viewer-zoom-value" data-testid="file-viewer-zoom">
                            {Math.round(scale * 100)}%
                        </span>
                        <button type="button" className="file-viewer-button" onClick={zoomIn} disabled={scale >= ZOOMS[ZOOMS.length - 1]! - 0.01} aria-label="Zoom in" title="Zoom in">
                            +
                        </button>
                    </span>
                ) : null}
                <button type="button" className="file-viewer-button" onClick={onDownload} aria-label="Download" title="Download" data-testid="file-viewer-download">
                    <PixelIcon name="download" size={18} />
                </button>
                <button type="button" className="file-viewer-button" onClick={onClose} aria-label="Close preview" title="Close">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
            <div className="file-viewer-body" ref={bodyRef} data-testid="file-viewer-body">
                {error ? <p className="file-viewer-message">{error}</p> : null}
                {loading ? <p className="file-viewer-message">Opening {name}…</p> : null}
                {pdf
                    ? Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={index + 1} pdf={pdf} pageNumber={index + 1} scale={scale} />)
                    : null}
                {html !== null ? <SafeHtml html={html} className="file-viewer-document" /> : null}
                {truncated ? <p className="file-viewer-message">Showing the first 512 KB. Download the file to see all of it.</p> : null}
                {text !== null ? (
                    <div className="file-viewer-text">
                        <CodeBlock code={text} language={codeLanguage(name)} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
