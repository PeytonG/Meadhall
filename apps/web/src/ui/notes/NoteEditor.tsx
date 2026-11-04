// SPDX-License-Identifier: AGPL-3.0-only
// The text of one shared note, edited together: a textarea bound to the note's Y.Text. Typing becomes Yjs edits
// (NotesSession sends them); others' edits update the text in place and keep your cursor where it was.
import React, { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";

import { NOTE_MAX_BYTES, utf8Length } from "../../core/notes/notesSession";

interface NoteEditorProps {
    doc: Y.Doc;
    placeholder?: string;
    onSizeChange?: (bytes: number) => void;
    onTooBig?: () => void;
}

// Where the old and new text differ: one contiguous change, as typing, pasting and deleting make.
function diff(before: string, after: string): { start: number; removed: number; inserted: string } {
    let start = 0;
    const shortest = Math.min(before.length, after.length);
    while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
    let endBefore = before.length;
    let endAfter = after.length;
    while (endBefore > start && endAfter > start && before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {
        endBefore -= 1;
        endAfter -= 1;
    }
    return { start, removed: endBefore - start, inserted: after.slice(start, endAfter) };
}

export function NoteEditor({ doc, placeholder, onSizeChange, onTooBig }: NoteEditorProps): React.ReactElement {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const lastValue = useRef("");
    const [origin] = useState(() => ({ editor: true }));
    const onSizeRef = useRef(onSizeChange);
    onSizeRef.current = onSizeChange;

    useEffect(() => {
        const text = doc.getText("text");
        const textarea = textareaRef.current;
        if (!textarea) return undefined;
        textarea.value = text.toString();
        lastValue.current = textarea.value;
        onSizeRef.current?.(utf8Length(textarea.value));

        const onRemote = (event: Y.YTextEvent, transaction: Y.Transaction): void => {
            if (transaction.origin === origin) return;
            // Move the selection along with what changed before it.
            let selectionStart = textarea.selectionStart;
            let selectionEnd = textarea.selectionEnd;
            let index = 0;
            for (const part of event.delta) {
                if (part.retain) {
                    index += part.retain;
                } else if (typeof part.insert === "string") {
                    const length = part.insert.length;
                    if (index <= selectionStart) selectionStart += length;
                    if (index < selectionEnd) selectionEnd += length;
                    index += length;
                } else if (part.delete) {
                    const length = part.delete;
                    if (index < selectionStart) selectionStart -= Math.min(length, selectionStart - index);
                    if (index < selectionEnd) selectionEnd -= Math.min(length, selectionEnd - index);
                }
            }
            const focused = document.activeElement === textarea;
            textarea.value = text.toString();
            lastValue.current = textarea.value;
            if (focused) textarea.setSelectionRange(selectionStart, selectionEnd);
            onSizeRef.current?.(utf8Length(textarea.value));
        };
        text.observe(onRemote);
        return () => text.unobserve(onRemote);
    }, [doc, origin]);

    const onInput = (event: React.FormEvent<HTMLTextAreaElement>): void => {
        const textarea = event.currentTarget;
        const before = lastValue.current;
        const after = textarea.value;
        const bytes = utf8Length(after);
        if (bytes > NOTE_MAX_BYTES && bytes > utf8Length(before)) {
            // Over the limit: undo this edit (deleting is always allowed).
            const caret = Math.max(0, textarea.selectionStart - (after.length - before.length));
            textarea.value = before;
            textarea.setSelectionRange(caret, caret);
            onTooBig?.();
            return;
        }
        const change = diff(before, after);
        const text = doc.getText("text");
        doc.transact(() => {
            if (change.removed) text.delete(change.start, change.removed);
            if (change.inserted) text.insert(change.start, change.inserted);
        }, origin);
        lastValue.current = after;
        onSizeRef.current?.(bytes);
    };

    return (
        <textarea
            ref={textareaRef}
            className="notes-editor-text"
            onInput={onInput}
            placeholder={placeholder}
            spellCheck
            aria-label="Note text"
            data-testid="note-text"
        />
    );
}
