// SPDX-License-Identifier: AGPL-3.0-only
// Code in plain-text messages: ```fenced blocks``` (with an optional language) and `inline code`.
// Everything else is left to the normal message rendering (links, mentions, emoji).

export type CodeSegment =
    | { type: "text"; value: string }
    | { type: "inline"; value: string }
    | { type: "block"; value: string; language: string | null };

// ```lang<newline>code``` (language optional) or ```code``` on one line.
const FENCE = /```(?:([A-Za-z0-9_+#.-]{1,32})?[ \t]*\n([\s\S]*?)|([\s\S]*?))```/g;
const INLINE = /`([^`\n]+)`/g;

function splitInline(text: string, out: CodeSegment[]): void {
    let cursor = 0;
    for (const match of text.matchAll(INLINE)) {
        const start = match.index ?? 0;
        if (start > cursor) out.push({ type: "text", value: text.slice(cursor, start) });
        out.push({ type: "inline", value: match[1]! });
        cursor = start + match[0].length;
    }
    if (cursor < text.length) out.push({ type: "text", value: text.slice(cursor) });
}

export function splitCode(body: string): CodeSegment[] {
    if (!body.includes("`")) return [{ type: "text", value: body }];
    const out: CodeSegment[] = [];
    let cursor = 0;
    for (const match of body.matchAll(FENCE)) {
        const start = match.index ?? 0;
        if (start > cursor) splitInline(body.slice(cursor, start).replace(/\n$/, ""), out);
        const code = match[2] ?? match[3] ?? "";
        out.push({ type: "block", value: code.replace(/\n$/, ""), language: match[1] ?? null });
        cursor = start + match[0].length;
        if (body[cursor] === "\n") cursor += 1;
    }
    if (cursor < body.length) splitInline(body.slice(cursor), out);
    return out.filter((segment) => segment.type !== "text" || segment.value.length > 0);
}
