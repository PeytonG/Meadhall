// SPDX-License-Identifier: AGPL-3.0-only
// PDF and Word previews. The libraries load only when someone opens one (pdf.js is large). pdf.js's legacy build:
// the regular one needs very new browser features (Uint8Array.toHex) that Android WebViews before Chrome 140 lack.
import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsLoading: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

async function loadPdfjs(): Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> {
    pdfjsLoading ??= Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]).then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
    });
    return pdfjsLoading;
}

export interface OpenedPdf {
    pdf: PDFDocumentProxy;
    // Frees the document and its worker memory.
    close: () => void;
}

// Opens a PDF from its bytes. Scripts and forms in PDFs never run (pdf.js 6 has no eval; XFA forms are off).
export async function openPdf(data: ArrayBuffer): Promise<OpenedPdf> {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(data), enableXfa: false });
    const pdf = await task.promise;
    return { pdf, close: () => void task.destroy() };
}

// Draws one page onto a canvas at `scale` (1 = the page's size in CSS pixels), sharp on high-DPI screens.
export async function renderPdfPage(pdf: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, scale: number): Promise<void> {
    const page = await pdf.getPage(pageNumber);
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    await page.render({ canvas, viewport }).promise;
}

// A Word document's text and formatting as HTML (mammoth). Render it with SafeHtml, never as raw HTML.
export async function docxToHtml(data: ArrayBuffer): Promise<string> {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer: data });
    return result.value;
}
