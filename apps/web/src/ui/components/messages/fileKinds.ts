// SPDX-License-Identifier: AGPL-3.0-only
// What kind of preview an attached file gets (FileAttachment / FileViewer).

export type FileKind = "pdf" | "text" | "docx" | "other";

// Text and code shown as text, by extension (mimetypes from other apps are often just application/octet-stream).
const TEXT_EXTENSIONS: Record<string, string | null> = {
    txt: null,
    log: null,
    md: "markdown",
    markdown: "markdown",
    csv: null,
    tsv: null,
    json: "json",
    xml: "xml",
    html: "xml",
    htm: "xml",
    svg: "xml",
    yml: "yaml",
    yaml: "yaml",
    toml: "ini",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    env: "bash",
    sh: "bash",
    bash: "bash",
    ps1: "powershell",
    bat: "dos",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    lua: "lua",
    sql: "sql",
    css: "css",
    scss: "scss",
    diff: "diff",
    patch: "diff",
};

// Text previews read at most this much (a bigger file shows its start; Download gets all of it).
export const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
// Documents (PDF, Word) are previewed up to this size.
export const DOCUMENT_PREVIEW_MAX_BYTES = 30 * 1024 * 1024;

export function fileExtension(name: string): string {
    const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
    return match ? match[1]!.toLowerCase() : "";
}

export function fileKind(name: string, mimeType?: string | null): FileKind {
    const extension = fileExtension(name);
    const mime = (mimeType ?? "").toLowerCase();
    if (mime === "application/pdf" || extension === "pdf") return "pdf";
    if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx") return "docx";
    if (extension in TEXT_EXTENSIONS || (mime.startsWith("text/") && mime !== "text/rtf")) return "text";
    if (mime === "application/json" || mime === "application/xml") return "text";
    return "other";
}

// highlight.js language for a text file, or null for plain text.
export function codeLanguage(name: string): string | null {
    return TEXT_EXTENSIONS[fileExtension(name)] ?? null;
}

// The short label on the file's icon: PDF, DOC, TXT, or the extension.
export function fileBadge(name: string, kind: FileKind): string {
    if (kind === "pdf") return "PDF";
    if (kind === "docx") return "DOC";
    const extension = fileExtension(name);
    return extension ? extension.slice(0, 4).toUpperCase() : "FILE";
}
