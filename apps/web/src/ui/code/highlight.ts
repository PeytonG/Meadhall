// SPDX-License-Identifier: AGPL-3.0-only
// Syntax highlighting for code blocks (loaded on first use, so it isn't in the main bundle).
// highlight.js returns HTML; it's turned back into plain tokens here (text + a class), never put in the page as HTML.
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import lua from "highlight.js/lib/languages/lua";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGES = { bash, c, cpp, csharp, css, diff, go, ini, java, javascript, json, kotlin, lua, markdown, php, powershell, python, ruby, rust, sql, swift, typescript, xml, yaml };
for (const [name, language] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, language);

// Very long blocks stay plain (highlighting them would freeze the chat).
const MAX_HIGHLIGHT_CHARS = 20_000;

export interface CodeToken {
    text: string;
    // highlight.js scope classes, e.g. "hljs-keyword" (only these ever come through).
    className?: string;
}

export interface HighlightResult {
    language: string | null;
    tokens: CodeToken[];
}

function toTokens(html: string): CodeToken[] {
    const tokens: CodeToken[] = [];
    const doc = new DOMParser().parseFromString(`<pre>${html}</pre>`, "text/html");
    const walk = (node: Node, classes: string[]): void => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? "";
            if (text) tokens.push(classes.length ? { text, className: classes.join(" ") } : { text });
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as HTMLElement;
        const own = element.tagName === "SPAN" ? [...element.classList].filter((name) => /^hljs-[a-z_-]+$/.test(name) || /^[a-z_]+_$/.test(name)) : [];
        const next = own.length ? [...classes, ...own] : classes;
        element.childNodes.forEach((child) => walk(child, next));
    };
    walk(doc.body.firstChild ?? doc.body, []);
    return tokens;
}

export function highlightCode(code: string, language?: string | null): HighlightResult {
    const plain = { language: null, tokens: [{ text: code }] };
    if (!code.trim() || code.length > MAX_HIGHLIGHT_CHARS) return plain;
    try {
        const requested = language?.toLowerCase().trim();
        if (requested && hljs.getLanguage(requested)) {
            const result = hljs.highlight(code, { language: requested, ignoreIllegals: true });
            return { language: hljs.getLanguage(requested)?.name ?? requested, tokens: toTokens(result.value) };
        }
        const result = hljs.highlightAuto(code);
        // Not sure what it is: leave it plain rather than colour it wrongly.
        if (!result.language || result.relevance < 5) return plain;
        return { language: hljs.getLanguage(result.language)?.name ?? result.language, tokens: toTokens(result.value) };
    } catch {
        return plain;
    }
}
