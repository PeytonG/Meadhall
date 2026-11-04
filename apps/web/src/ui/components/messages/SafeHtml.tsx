// SPDX-License-Identifier: AGPL-3.0-only
// Document HTML (a Word file converted by mammoth) shown safely: parsed, then rebuilt as React elements from a short
// list of formatting tags with no attributes, except link targets (http, https, mailto; they open outside Meadhall)
// and pictures embedded in the document (data: images only). Scripts, styles, frames and handlers never survive.
import React from "react";

const TAGS: Record<string, keyof React.JSX.IntrinsicElements> = {
    p: "p",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    h4: "h4",
    h5: "h5",
    h6: "h6",
    strong: "strong",
    b: "strong",
    em: "em",
    i: "em",
    u: "u",
    s: "del",
    del: "del",
    sup: "sup",
    sub: "sub",
    blockquote: "blockquote",
    ul: "ul",
    ol: "ol",
    li: "li",
    table: "table",
    thead: "thead",
    tbody: "tbody",
    tr: "tr",
    td: "td",
    th: "th",
    pre: "pre",
    code: "code",
};

const SAFE_LINK = /^(https?:|mailto:)/i;
const SAFE_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;

function rebuild(nodes: NodeListOf<ChildNode>, prefix: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    nodes.forEach((node, index) => {
        const key = `${prefix}.${index}`;
        if (node.nodeType === Node.TEXT_NODE) {
            out.push(node.textContent ?? "");
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as Element;
        const tag = element.tagName.toLowerCase();
        if (tag === "br") {
            out.push(<br key={key} />);
            return;
        }
        if (tag === "img") {
            const src = element.getAttribute("src") ?? "";
            if (SAFE_IMAGE.test(src)) out.push(<img key={key} src={src} alt={element.getAttribute("alt")?.slice(0, 200) ?? ""} />);
            return;
        }
        const children = rebuild(element.childNodes, key);
        if (tag === "a") {
            const href = element.getAttribute("href") ?? "";
            out.push(
                SAFE_LINK.test(href) ? (
                    <a key={key} href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                    </a>
                ) : (
                    <React.Fragment key={key}>{children}</React.Fragment>
                ),
            );
            return;
        }
        const Tag = TAGS[tag];
        if (Tag) {
            out.push(React.createElement(Tag, { key }, children));
        } else if (!["script", "style", "iframe", "object", "embed", "template", "noscript"].includes(tag)) {
            // Unknown wrappers (div, span, ...) keep their text, not themselves.
            out.push(...children);
        }
    });
    return out;
}

export function SafeHtml({ html, className }: { html: string; className?: string }): React.ReactElement {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return <div className={className}>{rebuild(parsed.body.childNodes, "doc")}</div>;
}
