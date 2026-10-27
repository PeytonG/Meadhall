// SPDX-License-Identifier: AGPL-3.0-only
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { splitCode } from "../../../../src/ui/code/codeMarkdown";
import { highlightCode } from "../../../../src/ui/code/highlight";
import { MessageRenderer } from "../../../../src/ui/components/MessageRenderer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(element: React.ReactElement): Promise<HTMLElement> {
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
        createRoot(container).render(element);
    });
    // The highlighter loads on first use.
    await act(async () => {
        await import("../../../../src/ui/code/highlight");
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return container;
}

describe("code in messages", () => {
    it("splits fenced blocks (with or without a language) and inline code", () => {
        expect(splitCode("no code here")).toEqual([{ type: "text", value: "no code here" }]);
        expect(splitCode("run `npm test` now")).toEqual([
            { type: "text", value: "run " },
            { type: "inline", value: "npm test" },
            { type: "text", value: " now" },
        ]);
        expect(splitCode("look:\n```ts\nconst a = 1;\n```\nnice")).toEqual([
            { type: "text", value: "look:" },
            { type: "block", value: "const a = 1;", language: "ts" },
            { type: "text", value: "nice" },
        ]);
        expect(splitCode("```\nplain\n```")).toEqual([{ type: "block", value: "plain", language: null }]);
        expect(splitCode("```one line```")).toEqual([{ type: "block", value: "one line", language: null }]);
        // An unclosed fence is just text.
        expect(splitCode("```oops")).toEqual([{ type: "text", value: "```oops" }]);
    });

    it("highlights known languages into plain tokens, and leaves unknown text alone", () => {
        const result = highlightCode("const answer = 42; // done", "typescript");
        expect(result.language).toBe("TypeScript");
        expect(result.tokens.map((token) => token.text).join("")).toBe("const answer = 42; // done");
        expect(result.tokens.find((token) => token.text === "const")?.className).toBe("hljs-keyword");
        expect(result.tokens.find((token) => token.text === "42")?.className).toBe("hljs-number");
        expect(highlightCode("just some words", null)).toEqual({ language: null, tokens: [{ text: "just some words" }] });
    });

    it("never turns code into HTML: tags in code stay text", () => {
        const evil = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
        const result = highlightCode(evil, "xml");
        expect(result.tokens.map((token) => token.text).join("")).toBe(evil);
        for (const token of result.tokens) expect(token.className ?? "hljs-x").toMatch(/^(hljs-[a-z_-]+|[a-z_]+_)( .*)?$/);
    });

    it("renders a code block from a plain message with highlighting, and copy text", async () => {
        const { CodeBlock } = await import("../../../../src/ui/code/CodeBlock");
        const container = await render(<CodeBlock code={"def hi():\n    return 1"} language="python" />);
        expect(container.querySelector("[data-testid='code-block']")?.getAttribute("data-language")).toBe("Python");
        expect(container.querySelector(".hljs-keyword")?.textContent).toBe("def");
        expect(container.querySelector("code")?.textContent).toBe("def hi():\n    return 1");
    });

    it("keeps code and basic formatting from other apps' HTML, without their attributes or scripts", async () => {
        const container = await render(
            <MessageRenderer
                body="fallback"
                format="org.matrix.custom.html"
                formattedBody={`<p><b onclick="x()">bold</b> and <code>inline</code></p><pre><code class="language-js">let x = "&lt;script&gt;alert(1)&lt;/script&gt;";\n</code></pre><a href="javascript:alert(1)">link</a><script>alert(3)</script>`}
            />,
        );
        expect(container.querySelector("strong")?.textContent).toBe("bold");
        expect(container.querySelector("strong")?.getAttribute("onclick")).toBeNull();
        expect(container.querySelector(".inline-code")?.textContent).toBe("inline");
        expect(container.querySelector("[data-testid='code-block']")?.getAttribute("data-language")).toBe("JavaScript");
        expect(container.querySelector(".code-block code")?.textContent).toBe(`let x = "<script>alert(1)</script>";`);
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector("a")).toBeNull();
        expect(container.innerHTML).not.toContain("onclick");
    });
});
