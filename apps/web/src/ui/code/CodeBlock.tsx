// SPDX-License-Identifier: AGPL-3.0-only
// A code block in a message: highlighted (once the highlighter has loaded), with its language and a copy button.
import React, { useEffect, useState } from "react";

import type { HighlightResult } from "./highlight";

let highlighter: Promise<typeof import("./highlight")> | null = null;

function loadHighlighter(): Promise<typeof import("./highlight")> {
    highlighter ??= import("./highlight");
    return highlighter;
}

export function CodeBlock({ code, language }: { code: string; language?: string | null }): React.ReactElement {
    const [result, setResult] = useState<HighlightResult | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void loadHighlighter()
            .then(({ highlightCode }) => {
                if (!cancelled) setResult(highlightCode(code, language));
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [code, language]);

    const copy = (): void => {
        void navigator.clipboard
            ?.writeText(code)
            .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined);
    };

    const label = result?.language ?? language ?? null;
    return (
        <div className="code-block" data-testid="code-block" data-language={label ?? undefined}>
            <div className="code-block-bar">
                <span className="code-block-language">{label ?? "code"}</span>
                <button type="button" className="code-block-copy" onClick={copy} aria-label="Copy code">
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <pre className="code-block-pre">
                <code className="hljs">
                    {result
                        ? result.tokens.map((token, index) =>
                              token.className ? (
                                  <span key={index} className={token.className}>
                                      {token.text}
                                  </span>
                              ) : (
                                  <React.Fragment key={index}>{token.text}</React.Fragment>
                              ),
                          )
                        : code}
                </code>
            </pre>
        </div>
    );
}

export function InlineCode({ children }: { children: React.ReactNode }): React.ReactElement {
    return <code className="inline-code">{children}</code>;
}
