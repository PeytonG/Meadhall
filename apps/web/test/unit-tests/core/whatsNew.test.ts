// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, it } from "vitest";

import { notesSince, parseChangelog, pendingReleaseNotes } from "../../../src/core/updates/whatsNew";

const CHANGELOG = [
    "# Changelog",
    "",
    "Intro text.",
    "",
    "## Unreleased",
    "- Not out yet",
    "",
    "## v0.3.1 (2026-10-24)",
    "### New",
    "- **Soundboard**",
    "",
    "## v0.3.0 (2026-10-23)",
    "- Roles",
    "",
    "## v0.2.0",
    "- Calls",
].join("\r\n");

describe("what's new", () => {
    beforeEach(() => window.localStorage.clear());

    it("reads release sections, skipping Unreleased", () => {
        expect(parseChangelog(CHANGELOG)).toEqual([
            { version: "0.3.1", date: "2026-10-24", body: "### New\n- **Soundboard**" },
            { version: "0.3.0", date: "2026-10-23", body: "- Roles" },
            { version: "0.2.0", date: null, body: "- Calls" },
        ]);
    });

    it("shows every release since the last one this install ran, newest first", () => {
        expect(notesSince(CHANGELOG, "0.2.0", "0.3.1").map((note) => note.version)).toEqual(["0.3.1", "0.3.0"]);
        expect(notesSince(CHANGELOG, "0.3.0", "0.3.0")).toEqual([]);
    });

    it("stays quiet on a first install and after the notes were seen", () => {
        expect(pendingReleaseNotes(CHANGELOG, "0.3.0", false)).toEqual([]);
        expect(pendingReleaseNotes(CHANGELOG, "0.3.1").map((note) => note.version)).toEqual(["0.3.1"]);
        expect(pendingReleaseNotes(CHANGELOG, "")).toEqual([]);
    });

    it("shows this release's notes when updating from a version before What's new existed", () => {
        expect(pendingReleaseNotes(CHANGELOG, "0.3.1", true).map((note) => note.version)).toEqual(["0.3.1"]);
    });
});
