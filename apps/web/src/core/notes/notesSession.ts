// SPDX-License-Identifier: AGPL-3.0-only
// Live shared notes over Matrix (see notesRoom.ts for where they live). The folder tree and each note are Yjs
// documents (CRDTs), so edits from several people at once merge without conflicts:
// - Every edit becomes a Yjs update, batched (about a second) into a NOTES_UPDATE_EVENT in the notes room. Matrix
//   isn't a realtime channel and homeservers rate-limit, so others see edits after a moment, not per keystroke.
// - After a pause in editing, the editor saves a snapshot of the document as a file (encrypted in encrypted rooms)
//   and posts a NOTES_SNAPSHOT_EVENT, so opening notes needs the latest snapshot plus the edits after it, not the
//   whole history. Updates are idempotent, so applying an older one again is harmless.
// - Big changes (a paste of most of a note) go straight into a snapshot: events are limited to 64 KB.
import * as encrypt from "matrix-encrypt-attachment";
import { MatrixEventEvent, RoomEvent, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";
import * as Y from "yjs";

export const NOTES_UPDATE_EVENT = "io.github.peytong.meadhall.notes.update";
export const NOTES_SNAPSHOT_EVENT = "io.github.peytong.meadhall.notes.snapshot";
// The owner's limit: each note at most 0.3 MB of text.
export const NOTE_MAX_BYTES = 300_000;
export const TREE_DOC = "tree";

const REMOTE = "remote";
const FLUSH_DELAY_MS = 700;
const FLUSH_MAX_WAIT_MS = 2_000;
const SNAPSHOT_IDLE_MS = 8_000;
// Bigger merged updates go into a snapshot file instead (events are limited to 64 KB, base64 adds a third).
const MAX_UPDATE_BYTES = 30_000;

export interface NotesFolder {
    id: string;
    name: string;
    parentId: string | null;
}

export interface NotesNote {
    id: string;
    title: string;
    folderId: string | null;
    createdAt: number;
}

export interface NotesTree {
    folders: NotesFolder[];
    notes: NotesNote[];
}

interface EncryptedFile {
    url: string;
    key: unknown;
    iv: string;
    hashes: Record<string, string>;
    v: string;
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function newId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    return toBase64(bytes).replace(/[+/=]/g, "").slice(0, 12);
}

export function utf8Length(text: string): number {
    return new TextEncoder().encode(text).length;
}

export class NotesSession {
    readonly tree = new Y.Doc();
    private readonly notes = new Map<string, Y.Doc>();
    private readonly applied = new Set<string>();
    private readonly snapshotFound = new Set<string>();
    private readonly ownSnapshotUrls = new Set<string>();
    private readonly outgoing = new Map<string, Uint8Array[]>();
    private readonly dirtySinceSnapshot = new Set<string>();
    private readonly lastEditor = new Map<string, { userId: string; ts: number }>();
    private readonly listeners = new Set<() => void>();
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private firstPendingAt = 0;
    private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    private reachedStart = false;
    private loading: Promise<void> = Promise.resolve();
    private closed = false;
    private sendError: string | null = null;

    constructor(
        private readonly client: MatrixClient,
        readonly room: Room,
    ) {
        this.watch(this.tree, TREE_DOC);
        this.tree.on("update", () => this.emit());
        this.room.on(RoomEvent.Timeline, this.onTimeline);
    }

    // Loads the folder tree (latest snapshot and the edits after it).
    async start(): Promise<void> {
        await this.loadUntil(TREE_DOC);
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(): void {
        for (const listener of this.listeners) listener();
    }

    get status(): { pending: boolean; error: string | null } {
        return { pending: this.outgoing.size > 0 || this.flushTimer !== null, error: this.sendError };
    }

    lastEditedBy(docId: string): { userId: string; ts: number } | null {
        return this.lastEditor.get(docId) ?? null;
    }

    // --- The folder tree ---

    private get folderMap(): Y.Map<Y.Map<unknown>> {
        return this.tree.getMap("folders");
    }

    private get noteMap(): Y.Map<Y.Map<unknown>> {
        return this.tree.getMap("notes");
    }

    readTree(): NotesTree {
        const folders: NotesFolder[] = [];
        this.folderMap.forEach((value, id) => {
            const name = value.get("name");
            const parentId = value.get("parentId");
            folders.push({ id, name: typeof name === "string" ? name : "Folder", parentId: typeof parentId === "string" ? parentId : null });
        });
        const notes: NotesNote[] = [];
        this.noteMap.forEach((value, id) => {
            const title = value.get("title");
            const folderId = value.get("folderId");
            const createdAt = value.get("createdAt");
            notes.push({
                id,
                title: typeof title === "string" ? title : "Untitled",
                folderId: typeof folderId === "string" ? folderId : null,
                createdAt: typeof createdAt === "number" ? createdAt : 0,
            });
        });
        // A folder or note whose folder was deleted (by someone else, at the same time) shows at the top level.
        const folderIds = new Set(folders.map((folder) => folder.id));
        for (const folder of folders) if (folder.parentId && !folderIds.has(folder.parentId)) folder.parentId = null;
        for (const note of notes) if (note.folderId && !folderIds.has(note.folderId)) note.folderId = null;
        return { folders, notes };
    }

    createFolder(name: string, parentId: string | null): string {
        const id = newId();
        this.tree.transact(() => {
            const folder = new Y.Map<unknown>();
            folder.set("name", name.trim().slice(0, 100) || "New folder");
            folder.set("parentId", parentId);
            this.folderMap.set(id, folder);
        });
        return id;
    }

    createNote(title: string, folderId: string | null): string {
        const id = newId();
        this.tree.transact(() => {
            const note = new Y.Map<unknown>();
            note.set("title", title.trim().slice(0, 200) || "Untitled");
            note.set("folderId", folderId);
            note.set("createdAt", Date.now());
            this.noteMap.set(id, note);
        });
        // A new note has no history to look for.
        this.snapshotFound.add(id);
        this.noteDoc(id);
        return id;
    }

    rename(kind: "folder" | "note", id: string, name: string): void {
        const entry = (kind === "folder" ? this.folderMap : this.noteMap).get(id);
        entry?.set(kind === "folder" ? "name" : "title", name.trim().slice(0, kind === "folder" ? 100 : 200) || (kind === "folder" ? "Folder" : "Untitled"));
    }

    // Moves a note or folder into `parentId` (null = top level). A folder can't go inside itself.
    move(kind: "folder" | "note", id: string, parentId: string | null): boolean {
        if (kind === "folder") {
            for (let cursor = parentId; cursor; cursor = (this.folderMap.get(cursor)?.get("parentId") as string | null) ?? null) {
                if (cursor === id) return false;
            }
            this.folderMap.get(id)?.set("parentId", parentId);
        } else {
            this.noteMap.get(id)?.set("folderId", parentId);
        }
        return true;
    }

    // Deletes a note, or a folder with everything in it.
    remove(kind: "folder" | "note", id: string): void {
        this.tree.transact(() => {
            if (kind === "note") {
                this.noteMap.delete(id);
                return;
            }
            const { folders, notes } = this.readTree();
            const doomed = new Set([id]);
            let grew = true;
            while (grew) {
                grew = false;
                for (const folder of folders) {
                    if (folder.parentId && doomed.has(folder.parentId) && !doomed.has(folder.id)) {
                        doomed.add(folder.id);
                        grew = true;
                    }
                }
            }
            for (const note of notes) if (note.folderId && doomed.has(note.folderId)) this.noteMap.delete(note.id);
            for (const folderId of doomed) this.folderMap.delete(folderId);
        });
    }

    // --- Notes ---

    private noteDoc(id: string): Y.Doc {
        let doc = this.notes.get(id);
        if (!doc) {
            doc = new Y.Doc();
            this.notes.set(id, doc);
            this.watch(doc, id);
        }
        return doc;
    }

    // The note's document, with its latest snapshot and edits loaded.
    async openNote(id: string): Promise<Y.Doc> {
        const doc = this.noteDoc(id);
        await this.loadUntil(id);
        return doc;
    }

    // --- Sending ---

    private watch(doc: Y.Doc, docId: string): void {
        doc.on("update", (update: Uint8Array, origin: unknown) => {
            if (origin === REMOTE || this.closed) return;
            const queue = this.outgoing.get(docId) ?? [];
            queue.push(update);
            this.outgoing.set(docId, queue);
            this.dirtySinceSnapshot.add(docId);
            this.lastEditor.set(docId, { userId: this.client.getSafeUserId(), ts: Date.now() });
            this.scheduleFlush();
            this.scheduleSnapshot();
        });
    }

    private scheduleFlush(): void {
        if (!this.firstPendingAt) this.firstPendingAt = Date.now();
        if (this.flushTimer) clearTimeout(this.flushTimer);
        const wait = Math.max(0, Math.min(FLUSH_DELAY_MS, this.firstPendingAt + FLUSH_MAX_WAIT_MS - Date.now()));
        this.flushTimer = setTimeout(() => void this.flush(), wait);
        this.emit();
    }

    private scheduleSnapshot(): void {
        if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
        this.snapshotTimer = setTimeout(() => void this.snapshotDirty(), SNAPSHOT_IDLE_MS);
    }

    // Sends batched edits. On a rate limit, keeps them and tries again after the wait the server asks for.
    async flush(): Promise<void> {
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = null;
        this.firstPendingAt = 0;
        const batches = [...this.outgoing.entries()];
        this.outgoing.clear();
        for (const [docId, updates] of batches) {
            const merged = Y.mergeUpdates(updates);
            try {
                if (merged.length > MAX_UPDATE_BYTES) {
                    await this.sendSnapshot(docId);
                } else {
                    await this.client.sendEvent(this.room.roomId, NOTES_UPDATE_EVENT as never, { doc: docId, update: toBase64(merged) } as never);
                }
                this.sendError = null;
            } catch (error) {
                const queue = this.outgoing.get(docId) ?? [];
                this.outgoing.set(docId, [merged, ...queue]);
                const retryAfter = (error as { data?: { retry_after_ms?: number }; errcode?: string }).data?.retry_after_ms;
                this.sendError = (error as { errcode?: string }).errcode === "M_LIMIT_EXCEEDED" ? null : "Couldn't save your last changes; retrying.";
                if (!this.closed) {
                    this.firstPendingAt = Date.now();
                    this.flushTimer = setTimeout(() => void this.flush(), Math.max(1_000, retryAfter ?? 3_000));
                }
            }
        }
        this.emit();
    }

    private async snapshotDirty(): Promise<void> {
        await this.flush();
        for (const docId of [...this.dirtySinceSnapshot]) {
            try {
                await this.sendSnapshot(docId);
                this.dirtySinceSnapshot.delete(docId);
            } catch {
                // Edits are already saved as updates; the next pause tries again.
            }
        }
    }

    private async sendSnapshot(docId: string): Promise<void> {
        const doc = docId === TREE_DOC ? this.tree : this.noteDoc(docId);
        const data = Y.encodeStateAsUpdate(doc);
        const encrypted = Boolean(await this.client.getCrypto()?.isEncryptionEnabledInRoom(this.room.roomId));
        let content: Record<string, unknown>;
        if (encrypted) {
            const sealed = await encrypt.encryptAttachment(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
            const { content_uri: url } = await this.client.uploadContent(new Blob([sealed.data], { type: "application/octet-stream" }), {
                includeFilename: false,
                type: "application/octet-stream",
            });
            this.ownSnapshotUrls.add(url);
            const file: EncryptedFile = {
                url,
                key: sealed.info.key,
                iv: sealed.info.iv,
                hashes: (sealed.info.hashes ?? {}) as Record<string, string>,
                v: sealed.info.v ?? "v2",
            };
            content = { doc: docId, file, size: data.length };
        } else {
            const { content_uri: url } = await this.client.uploadContent(new Blob([data], { type: "application/octet-stream" }), {
                includeFilename: false,
                type: "application/octet-stream",
            });
            this.ownSnapshotUrls.add(url);
            content = { doc: docId, url, size: data.length };
        }
        await this.client.sendEvent(this.room.roomId, NOTES_SNAPSHOT_EVENT as never, content as never);
    }

    // --- Receiving ---

    private readonly onTimeline = (event: MatrixEvent, room: Room | undefined, toStartOfTimeline: boolean | undefined): void => {
        if (room?.roomId !== this.room.roomId || toStartOfTimeline || this.closed) return;
        void this.receive(event).then((changed) => {
            if (changed) this.emit();
        });
    };

    private async decrypted(event: MatrixEvent): Promise<MatrixEvent> {
        if (event.isBeingDecrypted() || event.shouldAttemptDecryption()) {
            await this.client.decryptEventIfNeeded(event);
        }
        if (event.isEncrypted() && event.getType() === "m.room.encrypted") {
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(resolve, 5_000);
                event.once(MatrixEventEvent.Decrypted, () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        }
        return event;
    }

    // Applies one notes event. Returns whether anything changed.
    private async receive(event: MatrixEvent): Promise<boolean> {
        const id = event.getId();
        if (!id || this.applied.has(id) || id.startsWith("~")) return false;
        await this.decrypted(event);
        const type = event.getType();
        if (type !== NOTES_UPDATE_EVENT && type !== NOTES_SNAPSHOT_EVENT) return false;
        this.applied.add(id);
        const content = event.getContent() as { doc?: unknown; update?: unknown; url?: unknown; file?: EncryptedFile };
        if (typeof content.doc !== "string") return false;
        const doc = content.doc === TREE_DOC ? this.tree : this.notes.get(content.doc) ?? this.noteDoc(content.doc);
        const sender = event.getSender();
        if (sender && sender !== this.client.getSafeUserId()) {
            const previous = this.lastEditor.get(content.doc);
            if (!previous || previous.ts < event.getTs()) this.lastEditor.set(content.doc, { userId: sender, ts: event.getTs() });
        }
        try {
            if (type === NOTES_UPDATE_EVENT && typeof content.update === "string") {
                Y.applyUpdate(doc, fromBase64(content.update), REMOTE);
                return true;
            }
            if (type === NOTES_SNAPSHOT_EVENT) {
                this.snapshotFound.add(content.doc);
                const url = typeof content.url === "string" ? content.url : content.file?.url;
                if (!url || this.ownSnapshotUrls.has(url)) return false;
                Y.applyUpdate(doc, await this.download(url, content.file), REMOTE);
                return true;
            }
        } catch {
            // A damaged or undecryptable edit: skip it; the next snapshot carries its content.
        }
        return false;
    }

    private async download(mxc: string, file?: EncryptedFile): Promise<Uint8Array> {
        const httpUrl = this.client.mxcUrlToHttp(mxc, undefined, undefined, undefined, false, true, true);
        if (!httpUrl) throw new Error("Bad snapshot URL");
        const token = this.client.getAccessToken();
        const response = await fetch(httpUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!response.ok) throw new Error(`Snapshot download failed (${response.status})`);
        const data = await response.arrayBuffer();
        if (!file) return new Uint8Array(data);
        return new Uint8Array(await encrypt.decryptAttachment(data, file as never));
    }

    // Applies everything already loaded, then pages back through the notes room until `docId`'s latest snapshot (or
    // the room's beginning) has been seen. One load at a time.
    private loadUntil(docId: string): Promise<void> {
        this.loading = this.loading.then(async () => {
            for (;;) {
                const events = this.room.getLiveTimeline().getEvents();
                // Oldest first, so a snapshot comes before the edits made after it.
                for (const event of events) await this.receive(event);
                if (this.snapshotFound.has(docId) || this.reachedStart || this.closed) break;
                const before = this.room.getLiveTimeline().getEvents().length;
                await this.client.scrollback(this.room, 50);
                const after = this.room.getLiveTimeline().getEvents().length;
                if (after === before || !this.room.getLiveTimeline().getPaginationToken("b" as never)) this.reachedStart = true;
            }
            this.emit();
        });
        return this.loading;
    }

    // Saves what's left (edits and a snapshot) and stops listening.
    async close(): Promise<void> {
        if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
        await this.snapshotDirty().catch(() => undefined);
        this.closed = true;
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.room.off(RoomEvent.Timeline, this.onTimeline);
        this.listeners.clear();
    }
}
