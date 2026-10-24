// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { environmentSummary } from "../../../src/ui/settings/user/tabs/environmentSummary";

describe("bug report version line", () => {
    it("names Meadhall, the app, the system and the engine (never the package name)", () => {
        const desktop =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) @heorot/desktop/0.3.4 Chrome/152.0.7977.167 Electron/44.9.3 Safari/537.36";
        expect(environmentSummary(desktop, "0.3.4", "desktop")).toBe("Meadhall 0.3.4 · Desktop app · Windows 64-bit · Electron 44.9.3 (Chrome 152)");
        expect(environmentSummary("Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile", "0.3.4", "mobile")).toBe("Meadhall 0.3.4 · Phone app · Android 15 · Chrome 140");
        expect(environmentSummary("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", "", "web")).toBe("Meadhall (web) · Web · Linux · Firefox 140");
    });
});
