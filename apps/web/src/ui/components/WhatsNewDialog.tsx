// SPDX-License-Identifier: AGPL-3.0-only
// Shown once after the app updates: the CHANGELOG sections for the new version(s).
import React, { useEffect, useState } from "react";

import changelog from "../../../../../CHANGELOG.md?raw";
import { currentAppVersion } from "../../core/updates/mobileUpdates";
import { currentPlatform } from "../presence/clientStatus";
import { markVersionSeen, pendingReleaseNotes, type ReleaseNotes } from "../../core/updates/whatsNew";

// **bold** inside a line of CHANGELOG text.
function inline(text: string): React.ReactNode[] {
    return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part,
    );
}

// The CHANGELOG's small markdown subset: "### Heading", "- item" (continued on indented lines) and paragraphs.
function renderNotes(body: string): React.ReactNode[] {
    const blocks: React.ReactNode[] = [];
    let items: string[] = [];
    const flush = (): void => {
        if (items.length > 0) {
            blocks.push(
                <ul key={`list-${blocks.length}`}>
                    {items.map((item, index) => (
                        <li key={index}>{inline(item)}</li>
                    ))}
                </ul>,
            );
            items = [];
        }
    };
    for (const line of body.split("\n")) {
        if (line.startsWith("### ")) {
            flush();
            blocks.push(<h4 key={`heading-${blocks.length}`}>{line.slice(4)}</h4>);
        } else if (line.startsWith("- ")) {
            items.push(line.slice(2));
        } else if (/^\s+\S/.test(line) && items.length > 0) {
            items[items.length - 1] += ` ${line.trim()}`;
        } else if (line.trim()) {
            flush();
            blocks.push(<p key={`text-${blocks.length}`}>{inline(line.trim())}</p>);
        }
    }
    flush();
    return blocks;
}

// The installed app's version: desktop and phone apps only (the web app is always the latest page).
async function appVersion(): Promise<string> {
    if (window.heorotDesktop?.getAppVersion) return window.heorotDesktop.getAppVersion().catch(() => "");
    return currentPlatform() === "mobile" ? currentAppVersion() : "";
}

export function WhatsNewDialog(): React.ReactElement | null {
    const [notes, setNotes] = useState<ReleaseNotes[]>([]);
    const [version, setVersion] = useState("");

    useEffect(() => {
        let cancelled = false;
        void appVersion().then((current) => {
            if (cancelled) return;
            setVersion(current);
            setNotes(pendingReleaseNotes(changelog, current));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (notes.length === 0) return null;
    const close = (): void => {
        markVersionSeen(version);
        setNotes([]);
    };
    return (
        <div className="whats-new-overlay" role="dialog" aria-modal="true" aria-label="What's new" onClick={close}>
            <div className="whats-new" onClick={(event) => event.stopPropagation()} data-testid="whats-new">
                <header>
                    <h2>What&apos;s new in Meadhall {notes[0].version}</h2>
                    <button type="button" className="whats-new-close" onClick={close} aria-label="Close">
                        ×
                    </button>
                </header>
                <div className="whats-new-body">
                    {notes.map((note) => (
                        <section key={note.version}>
                            {notes.length > 1 ? <h3>{note.version}</h3> : null}
                            {renderNotes(note.body)}
                        </section>
                    ))}
                </div>
                <button type="button" className="settings-button" onClick={close} autoFocus>
                    Got it
                </button>
            </div>
        </div>
    );
}
