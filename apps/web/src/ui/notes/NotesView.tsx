// SPDX-License-Identifier: AGPL-3.0-only
// Shared notes for a DM, group chat or space: folders inside folders, several notes, each edited together live
// (core/notes). The tree is on the left (drag a note or folder onto a folder to move it, or use its menu), the open
// note on the right. On phones one shows at a time.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";
import type * as Y from "yjs";

import { canCreateNotes, hasNotes, openNotesRoom } from "../../core/notes/notesRoom";
import { NOTE_MAX_BYTES, NotesSession, type NotesFolder, type NotesNote, type NotesTree } from "../../core/notes/notesSession";
import { PixelIcon } from "../components/PixelIcon";
import { NoteEditor } from "./NoteEditor";

interface NotesViewProps {
    client: MatrixClient;
    parent: Room;
    isPhone: boolean;
    onClose: () => void;
}

type Selection = { kind: "folder" | "note"; id: string } | null;

function formatKb(bytes: number): string {
    return `${Math.ceil(bytes / 1000)} KB`;
}

function timeAgo(ts: number): string {
    const seconds = Math.round((Date.now() - ts) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
    return new Date(ts).toLocaleString();
}

const byName = (left: { name?: string; title?: string }, right: { name?: string; title?: string }): number =>
    (left.name ?? left.title ?? "").localeCompare(right.name ?? right.title ?? "", undefined, { sensitivity: "base" });

export function NotesView({ client, parent, isPhone, onClose }: NotesViewProps): React.ReactElement {
    const [phase, setPhase] = useState<"loading" | "none" | "ready" | "error">("loading");
    const [error, setError] = useState<string | null>(null);
    const [session, setSession] = useState<NotesSession | null>(null);
    const [tree, setTree] = useState<NotesTree>({ folders: [], notes: [] });
    const [, setTick] = useState(0);
    const [selected, setSelected] = useState<Selection>(null);
    const [openNoteId, setOpenNoteId] = useState<string | null>(null);
    const [noteDoc, setNoteDoc] = useState<Y.Doc | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [renaming, setRenaming] = useState<Selection>(null);
    const [menuFor, setMenuFor] = useState<Selection>(null);
    const [noteBytes, setNoteBytes] = useState(0);
    const [tooBig, setTooBig] = useState(false);
    const allowedToCreate = canCreateNotes(client, parent);
    const parentName = parent.name || "this chat";

    const start = useCallback(
        async (create: boolean) => {
            setPhase("loading");
            setError(null);
            try {
                const room = await openNotesRoom(client, parent, create);
                if (!room) {
                    setPhase("none");
                    return;
                }
                const next = new NotesSession(client, room);
                await next.start();
                setSession(next);
                setPhase("ready");
            } catch (failure) {
                setError(failure instanceof Error ? failure.message : String(failure));
                setPhase("error");
            }
        },
        [client, parent],
    );

    useEffect(() => {
        void start(false);
    }, [start]);

    useEffect(() => {
        if (!session) return undefined;
        const refresh = (): void => {
            setTree(session.readTree());
            setTick((tick) => tick + 1);
        };
        refresh();
        const stop = session.subscribe(refresh);
        return () => {
            stop();
            void session.close();
        };
    }, [session]);

    // The open note's document (loaded with its latest snapshot and edits).
    useEffect(() => {
        if (!session || !openNoteId) {
            setNoteDoc(null);
            return undefined;
        }
        let cancelled = false;
        setNoteDoc(null);
        setTooBig(false);
        void session.openNote(openNoteId).then((doc) => {
            if (!cancelled) setNoteDoc(doc);
        });
        return () => {
            cancelled = true;
        };
    }, [session, openNoteId]);

    // Android's Back (AppShell sends "meadhall:back"): close a menu or rename, then the open note on phones, then the notes.
    useEffect(() => {
        const onBack = (event: Event): void => {
            event.preventDefault();
            if (menuFor || renaming) {
                setMenuFor(null);
                setRenaming(null);
            } else if (isPhone && openNoteId) {
                setOpenNoteId(null);
            } else {
                onClose();
            }
        };
        window.addEventListener("meadhall:back", onBack);
        return () => window.removeEventListener("meadhall:back", onBack);
    }, [isPhone, menuFor, onClose, openNoteId, renaming]);

    // The open note was deleted (here or by someone else).
    useEffect(() => {
        if (openNoteId && phase === "ready" && !tree.notes.some((note) => note.id === openNoteId)) setOpenNoteId(null);
    }, [openNoteId, phase, tree.notes]);

    const foldersIn = useMemo(() => {
        const map = new Map<string | null, NotesFolder[]>();
        for (const folder of [...tree.folders].sort(byName)) {
            const list = map.get(folder.parentId) ?? [];
            list.push(folder);
            map.set(folder.parentId, list);
        }
        return map;
    }, [tree.folders]);
    const notesIn = useMemo(() => {
        const map = new Map<string | null, NotesNote[]>();
        for (const note of [...tree.notes].sort(byName)) {
            const list = map.get(note.folderId) ?? [];
            list.push(note);
            map.set(note.folderId, list);
        }
        return map;
    }, [tree.notes]);

    // New things go into the selected folder (or the folder of the selected note).
    const targetFolder = (): string | null => {
        if (!selected) return null;
        if (selected.kind === "folder") return selected.id;
        return tree.notes.find((note) => note.id === selected.id)?.folderId ?? null;
    };

    const newNote = (): void => {
        if (!session) return;
        const folderId = targetFolder();
        const id = session.createNote("Untitled", folderId);
        if (folderId) setExpanded((current) => new Set(current).add(folderId));
        setSelected({ kind: "note", id });
        setOpenNoteId(id);
        // Name it right there in the list; on phones the list is hidden behind the note, which has its own title box.
        if (!isPhone) setRenaming({ kind: "note", id });
    };

    const newFolder = (): void => {
        if (!session) return;
        const parentId = targetFolder();
        const id = session.createFolder("New folder", parentId);
        setExpanded((current) => {
            const next = new Set(current).add(id);
            if (parentId) next.add(parentId);
            return next;
        });
        setSelected({ kind: "folder", id });
        setRenaming({ kind: "folder", id });
    };

    const remove = (item: NonNullable<Selection>): void => {
        if (!session) return;
        const label = item.kind === "folder" ? tree.folders.find((folder) => folder.id === item.id)?.name : tree.notes.find((note) => note.id === item.id)?.title;
        const question = item.kind === "folder" ? `Delete the folder "${label}" and everything in it?` : `Delete the note "${label}"?`;
        if (!window.confirm(`${question} This deletes it for everyone.`)) return;
        session.remove(item.kind, item.id);
        setMenuFor(null);
        if (selected?.id === item.id) setSelected(null);
    };

    const onDrop = (event: React.DragEvent, folderId: string | null): void => {
        event.preventDefault();
        event.stopPropagation();
        const raw = event.dataTransfer.getData("application/x-meadhall-note");
        if (!raw || !session) return;
        const item = JSON.parse(raw) as NonNullable<Selection>;
        if (item.id === folderId) return;
        session.move(item.kind, item.id, folderId);
        if (folderId) setExpanded((current) => new Set(current).add(folderId));
    };

    const rowMenu = (item: NonNullable<Selection>, currentParent: string | null): React.ReactElement | null => {
        if (menuFor?.id !== item.id) return null;
        // Folders it may move into: not itself or anything inside it.
        const inside = new Set<string>();
        if (item.kind === "folder") {
            inside.add(item.id);
            let grew = true;
            while (grew) {
                grew = false;
                for (const folder of tree.folders) {
                    if (folder.parentId && inside.has(folder.parentId) && !inside.has(folder.id)) {
                        inside.add(folder.id);
                        grew = true;
                    }
                }
            }
        }
        return (
            <div className="notes-row-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                <button type="button" role="menuitem" onClick={() => { setRenaming(item); setMenuFor(null); }}>
                    Rename
                </button>
                <label className="notes-row-move">
                    Move to
                    <select
                        aria-label="Move to"
                        value={currentParent ?? ""}
                        onChange={(event) => {
                            session?.move(item.kind, item.id, event.target.value || null);
                            setMenuFor(null);
                        }}
                    >
                        <option value="">Top level</option>
                        {[...tree.folders].sort(byName).filter((folder) => !inside.has(folder.id)).map((folder) => (
                            <option key={folder.id} value={folder.id}>
                                {folder.name}
                            </option>
                        ))}
                    </select>
                </label>
                <button type="button" role="menuitem" className="is-danger" onClick={() => remove(item)}>
                    Delete
                </button>
            </div>
        );
    };

    const nameInput = (item: NonNullable<Selection>, current: string): React.ReactElement => (
        <input
            className="notes-rename"
            defaultValue={current}
            autoFocus
            aria-label={item.kind === "folder" ? "Folder name" : "Note title"}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                    event.stopPropagation();
                    setRenaming(null);
                }
            }}
            onBlur={(event) => {
                session?.rename(item.kind, item.id, event.currentTarget.value);
                setRenaming(null);
            }}
        />
    );

    const renderLevel = (parentId: string | null, depth: number): React.ReactNode => (
        <>
            {(foldersIn.get(parentId) ?? []).map((folder) => {
                const item = { kind: "folder" as const, id: folder.id };
                const open = expanded.has(folder.id);
                return (
                    <li key={folder.id} className="notes-tree-item">
                        <div
                            className={`notes-row is-folder${selected?.id === folder.id ? " is-selected" : ""}`}
                            style={{ paddingLeft: `${8 + depth * 16}px` }}
                            draggable={renaming?.id !== folder.id}
                            onDragStart={(event) => event.dataTransfer.setData("application/x-meadhall-note", JSON.stringify(item))}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => onDrop(event, folder.id)}
                            onClick={() => {
                                setSelected(item);
                                setExpanded((current) => {
                                    const next = new Set(current);
                                    if (next.has(folder.id)) next.delete(folder.id);
                                    else next.add(folder.id);
                                    return next;
                                });
                            }}
                            data-testid="notes-folder"
                            aria-expanded={open}
                        >
                            <span className="notes-row-caret" aria-hidden="true">
                                {open ? "▾" : "▸"}
                            </span>
                            <PixelIcon name="folder" size={16} />
                            {renaming?.id === folder.id ? nameInput(item, folder.name) : <span className="notes-row-name">{folder.name}</span>}
                            <button
                                type="button"
                                className="notes-row-more"
                                aria-label={`More for ${folder.name}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setMenuFor(menuFor?.id === folder.id ? null : item);
                                }}
                            >
                                ...
                            </button>
                            {rowMenu(item, folder.parentId)}
                        </div>
                        {open ? <ul className="notes-tree">{renderLevel(folder.id, depth + 1)}</ul> : null}
                    </li>
                );
            })}
            {(notesIn.get(parentId) ?? []).map((note) => {
                const item = { kind: "note" as const, id: note.id };
                return (
                    <li key={note.id} className="notes-tree-item">
                        <div
                            className={`notes-row is-note${openNoteId === note.id ? " is-open" : ""}${selected?.id === note.id ? " is-selected" : ""}`}
                            style={{ paddingLeft: `${8 + depth * 16 + 14}px` }}
                            draggable={renaming?.id !== note.id}
                            onDragStart={(event) => event.dataTransfer.setData("application/x-meadhall-note", JSON.stringify(item))}
                            onClick={() => {
                                setSelected(item);
                                setOpenNoteId(note.id);
                            }}
                            data-testid="notes-note"
                        >
                            <PixelIcon name="note" size={16} />
                            {renaming?.id === note.id ? nameInput(item, note.title) : <span className="notes-row-name">{note.title}</span>}
                            <button
                                type="button"
                                className="notes-row-more"
                                aria-label={`More for ${note.title}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setMenuFor(menuFor?.id === note.id ? null : item);
                                }}
                            >
                                ...
                            </button>
                            {rowMenu(item, note.folderId)}
                        </div>
                    </li>
                );
            })}
        </>
    );

    const openNote = tree.notes.find((note) => note.id === openNoteId) ?? null;
    const status = session?.status;
    const lastEdit = openNoteId ? session?.lastEditedBy(openNoteId) : null;
    const lastEditorName = lastEdit ? (lastEdit.userId === client.getUserId() ? "you" : session?.room.getMember(lastEdit.userId)?.name ?? lastEdit.userId) : null;
    const showTree = !isPhone || !openNoteId;
    const showEditor = !isPhone || Boolean(openNoteId);

    return (
        <section className="notes-view" data-testid="notes-view" aria-label={`Notes for ${parentName}`} onClick={() => setMenuFor(null)}>
            <header className="notes-header">
                {isPhone && openNoteId ? (
                    <button type="button" className="notes-icon-button" onClick={() => setOpenNoteId(null)} aria-label="Back to notes">
                        <PixelIcon name="back" size={18} />
                    </button>
                ) : null}
                <PixelIcon name="note" size={20} />
                <h2 className="notes-title">Notes · {parentName}</h2>
                <button type="button" className="notes-icon-button" onClick={onClose} aria-label="Close notes" title="Back to the chat" data-testid="notes-close">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                </button>
            </header>

            {phase === "loading" ? <p className="notes-message">Loading notes…</p> : null}
            {phase === "error" ? (
                <div className="notes-message">
                    <p>Couldn't open the notes: {error}</p>
                    <button type="button" className="settings-button" onClick={() => void start(hasNotes(parent))}>
                        Try again
                    </button>
                </div>
            ) : null}
            {phase === "none" ? (
                <div className="notes-empty" data-testid="notes-empty">
                    <PixelIcon name="note" size={40} />
                    <h3>Shared notes</h3>
                    <p>
                        Notes and folders for {parent.isSpaceRoom() ? "everyone in this space" : "everyone in this chat"}, edited together. Each note can
                        hold up to {formatKb(NOTE_MAX_BYTES)} of text.
                    </p>
                    {allowedToCreate ? (
                        <button type="button" className="settings-button" onClick={() => void start(true)} data-testid="notes-create">
                            Start shared notes
                        </button>
                    ) : (
                        <p className="notes-hint">Ask a moderator to start shared notes here.</p>
                    )}
                </div>
            ) : null}

            {phase === "ready" && session ? (
                <div className={`notes-body${isPhone ? " is-phone" : ""}`}>
                    {showTree ? (
                        <aside className="notes-sidebar" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, null)}>
                            <div className="notes-toolbar">
                                <button type="button" className="settings-button" onClick={newNote} data-testid="notes-new-note">
                                    <PixelIcon name="plus" size={14} /> Note
                                </button>
                                <button type="button" className="settings-button" onClick={newFolder} data-testid="notes-new-folder">
                                    <PixelIcon name="folder" size={14} /> Folder
                                </button>
                            </div>
                            {tree.folders.length === 0 && tree.notes.length === 0 ? (
                                <p className="notes-hint">No notes yet. Make the first one with Note.</p>
                            ) : (
                                <ul className="notes-tree" data-testid="notes-tree">
                                    {renderLevel(null, 0)}
                                </ul>
                            )}
                        </aside>
                    ) : null}
                    {showEditor ? (
                        <div className="notes-editor">
                            {openNote && noteDoc ? (
                                <>
                                    <input
                                        key={openNote.id}
                                        className="notes-editor-title"
                                        defaultValue={openNote.title}
                                        aria-label="Note title"
                                        data-testid="note-title"
                                        onBlur={(event) => {
                                            if (event.currentTarget.value !== openNote.title) session.rename("note", openNote.id, event.currentTarget.value);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") event.currentTarget.blur();
                                        }}
                                    />
                                    <NoteEditor
                                        key={openNote.id}
                                        doc={noteDoc}
                                        placeholder="Write something. Everyone here can see and edit it."
                                        onSizeChange={(bytes) => {
                                            setNoteBytes(bytes);
                                            if (bytes < NOTE_MAX_BYTES) setTooBig(false);
                                        }}
                                        onTooBig={() => setTooBig(true)}
                                    />
                                    <footer className="notes-status" data-testid="note-status">
                                        <span data-testid="note-size">
                                            {formatKb(noteBytes)} of {formatKb(NOTE_MAX_BYTES)}
                                        </span>
                                        <span>{status?.error ?? (status?.pending ? "Saving…" : "Saved")}</span>
                                        {lastEdit && lastEditorName ? <span>Last edited by {lastEditorName}, {timeAgo(lastEdit.ts)}</span> : null}
                                    </footer>
                                    {tooBig ? (
                                        <p className="notes-too-big" role="alert" data-testid="note-too-big">
                                            This note is full: notes can hold up to {formatKb(NOTE_MAX_BYTES)}. Start another note for the rest.
                                        </p>
                                    ) : null}
                                </>
                            ) : openNoteId ? (
                                <p className="notes-message">Opening the note…</p>
                            ) : (
                                <p className="notes-message">Pick a note, or make one with Note.</p>
                            )}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
