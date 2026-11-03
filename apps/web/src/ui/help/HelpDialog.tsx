// SPDX-License-Identifier: AGPL-3.0-only
// The Help button (? at the top of the chat): Meadhall's help by category, searchable. The text is
// docs/help/meadhall-help.md, the same file a small AI model can read to answer questions, so there is one source.
import React, { useMemo, useState } from "react";

import helpText from "../../../../../docs/help/meadhall-help.md?raw";
import { RoomDialog } from "../components/rooms/RoomDialog";

export interface HelpTopic {
    question: string;
    body: string;
}

export interface HelpCategory {
    title: string;
    topics: HelpTopic[];
}

// "## Category" then "### Question" sections; the intro before the first category is left out.
export function parseHelp(markdown: string): HelpCategory[] {
    const categories: HelpCategory[] = [];
    let topic: HelpTopic | null = null;
    for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
        if (line.startsWith("## ")) {
            categories.push({ title: line.slice(3).trim(), topics: [] });
            topic = null;
        } else if (line.startsWith("### ") && categories.length > 0) {
            topic = { question: line.slice(4).trim(), body: "" };
            categories[categories.length - 1]!.topics.push(topic);
        } else if (topic) {
            topic.body += `${line}\n`;
        }
    }
    for (const category of categories) for (const item of category.topics) item.body = item.body.trim();
    return categories;
}

// Just enough Markdown for the help: paragraphs, "- " lists and **bold**.
function inline(text: string): React.ReactNode[] {
    return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part));
}

function HelpBody({ text }: { text: string }): React.ReactElement {
    const blocks = text.split(/\n\s*\n/);
    return (
        <>
            {blocks.map((block, index) => {
                const lines = block.split("\n");
                if (lines.every((line) => line.startsWith("- "))) {
                    return (
                        <ul key={index}>
                            {lines.map((line, at) => (
                                <li key={at}>{inline(line.slice(2))}</li>
                            ))}
                        </ul>
                    );
                }
                return <p key={index}>{inline(lines.join(" "))}</p>;
            })}
        </>
    );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement | null {
    const categories = useMemo(() => parseHelp(helpText), []);
    const [category, setCategory] = useState(0);
    const [query, setQuery] = useState("");
    const term = query.trim().toLowerCase();
    const results = useMemo(() => {
        if (!term) return null;
        const words = term.split(/\s+/);
        return categories
            .flatMap((item) => item.topics.map((topic) => ({ category: item.title, topic })))
            .map((entry) => {
                const haystack = `${entry.topic.question} ${entry.topic.body}`.toLowerCase();
                const score = words.reduce((total, word) => total + (entry.topic.question.toLowerCase().includes(word) ? 3 : haystack.includes(word) ? 1 : 0), 0);
                return { ...entry, score };
            })
            .filter((entry) => entry.score > 0)
            .sort((left, right) => right.score - left.score)
            .slice(0, 20);
    }, [categories, term]);

    const shown = results ?? (categories[category]?.topics ?? []).map((topic) => ({ category: categories[category]!.title, topic }));
    return (
        <RoomDialog open={open} title="Help" onClose={onClose}>
            <div className="help-dialog" data-testid="help-dialog">
                <input type="search" className="help-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help" aria-label="Search help" autoFocus />
                <div className="help-layout">
                    {results ? null : (
                        <nav className="help-categories" aria-label="Help categories">
                            {categories.map((item, index) => (
                                <button key={item.title} type="button" className={`help-category${index === category ? " is-active" : ""}`} aria-current={index === category ? "true" : undefined} onClick={() => setCategory(index)}>
                                    {item.title}
                                </button>
                            ))}
                        </nav>
                    )}
                    <div className="help-topics">
                        {results && results.length === 0 ? <p className="help-empty">Nothing found. Try other words.</p> : null}
                        {shown.map(({ category: categoryTitle, topic }, index) => (
                            <details key={`${categoryTitle}|${topic.question}`} className="help-topic" open={Boolean(results) && index === 0}>
                                <summary>
                                    {topic.question}
                                    {results ? <small> · {categoryTitle}</small> : null}
                                </summary>
                                <HelpBody text={topic.body} />
                            </details>
                        ))}
                    </div>
                </div>
            </div>
        </RoomDialog>
    );
}
