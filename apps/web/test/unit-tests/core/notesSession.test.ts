// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { NotesSession, NOTES_UPDATE_EVENT, TREE_DOC, utf8Length } from "../../../src/core/notes/notesSession";

// A session whose sent events are captured instead of going to a homeserver.
function session(): { notes: NotesSession; sent: Array<{ type: string; content: { doc: string; update: string } }> } {
    const sent: Array<{ type: string; content: { doc: string; update: string } }> = [];
    const client = {
        getSafeUserId: () => "@alice:example.org",
        sendEvent: vi.fn(async (_roomId: string, type: string, content: { doc: string; update: string }) => {
            sent.push({ type, content });
            return { event_id: `$${sent.length}` };
        }),
        getCrypto: () => undefined,
        uploadContent: vi.fn(async () => ({ content_uri: "mxc://example.org/snapshot" })),
    };
    const room = { roomId: "!notes:example.org", on: vi.fn(), off: vi.fn() };
    return { notes: new NotesSession(client as never, room as never), sent };
}

describe("NotesSession", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("keeps folders inside folders, and won't move a folder into itself or its own subfolder", () => {
        const { notes } = session();
        const projects = notes.createFolder("Projects", null);
        const brewing = notes.createFolder("Brewing", projects);
        const recipe = notes.createNote("Mead recipe", brewing);

        expect(notes.readTree().folders.find((folder) => folder.id === brewing)?.parentId).toBe(projects);
        expect(notes.readTree().notes.find((note) => note.id === recipe)?.folderId).toBe(brewing);
        expect(notes.move("folder", projects, brewing)).toBe(false);
        expect(notes.move("folder", projects, projects)).toBe(false);
        expect(notes.readTree().folders.find((folder) => folder.id === projects)?.parentId).toBe(null);
        expect(notes.move("note", recipe, null)).toBe(true);
        expect(notes.readTree().notes.find((note) => note.id === recipe)?.folderId).toBe(null);
    });

    it("deleting a folder deletes everything inside it, at any depth", () => {
        const { notes } = session();
        const projects = notes.createFolder("Projects", null);
        const brewing = notes.createFolder("Brewing", projects);
        notes.createNote("Deep", brewing);
        notes.createNote("Shallow", projects);
        const kept = notes.createNote("Elsewhere", null);

        notes.remove("folder", projects);
        expect(notes.readTree().folders).toEqual([]);
        expect(notes.readTree().notes.map((note) => note.id)).toEqual([kept]);
    });

    it("batches edits into one update event that another copy can apply", async () => {
        vi.useFakeTimers();
        const { notes, sent } = session();
        notes.createFolder("A", null);
        notes.createFolder("B", null);
        await vi.advanceTimersByTimeAsync(2_500);
        const updates = sent.filter((event) => event.type === NOTES_UPDATE_EVENT && event.content.doc === TREE_DOC);
        expect(updates).toHaveLength(1);

        const copy = new Y.Doc();
        Y.applyUpdate(copy, Uint8Array.from(atob(updates[0]!.content.update), (char) => char.charCodeAt(0)));
        expect([...copy.getMap("folders").values()].map((folder) => (folder as Y.Map<unknown>).get("name")).sort()).toEqual(["A", "B"]);
    });

    it("measures note size in UTF-8 bytes (the 0.3 MB limit)", () => {
        expect(utf8Length("abc")).toBe(3);
        expect(utf8Length("ä")).toBe(2);
        expect(utf8Length("🍺")).toBe(4);
    });
});
