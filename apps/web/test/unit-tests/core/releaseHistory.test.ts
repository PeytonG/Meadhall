// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { cannotRollBackFrom, releaseChoices } from "../../../src/core/updates/releaseHistory";

describe("choosing an earlier version", () => {
    it("lists published releases other than the running one, newest first", () => {
        const releases = [
            { tag_name: "v0.3.0", published_at: "2026-10-23" },
            { tag_name: "v0.3.2" },
            { tag_name: "v0.3.1" },
            { tag_name: "v0.4.0", draft: true },
            { tag_name: "v0.4.0-beta", prerelease: true },
            { tag_name: "nightly" },
        ];
        expect(releaseChoices(releases, "0.3.2").map((choice) => choice.version)).toEqual(["0.3.1", "0.3.0"]);
    });

    it("warns about versions before 0.3.2, which can't roll back themselves", () => {
        expect(cannotRollBackFrom("0.3.1")).toBe(true);
        expect(cannotRollBackFrom("0.1.0")).toBe(true);
        expect(cannotRollBackFrom("0.3.2")).toBe(false);
        expect(cannotRollBackFrom("0.4.0")).toBe(false);
    });
});
