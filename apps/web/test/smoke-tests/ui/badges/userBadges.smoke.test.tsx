// SPDX-License-Identifier: AGPL-3.0-only
// The founder coin after a name for people on the official list, and "..." for anything else they claim.
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/core/badges/badges", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../src/core/badges/badges")>();
    return { ...actual, officialBadgesFor: async (userId: string) => (userId.startsWith("@founder") ? ["founder"] : []) };
});

import { UserBadges } from "../../../../src/ui/components/badges/UserBadges";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const client = (claims: Record<string, unknown>) =>
    ({ getExtendedProfileProperty: async (userId: string) => claims[userId] ?? null }) as unknown as MatrixClient;

async function render(userId: string, claims: Record<string, unknown> = {}): Promise<void> {
    await act(async () => {
        root.render(<UserBadges client={client(claims)} userId={userId} />);
    });
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe("UserBadges", () => {
    it("shows the founder coin for people on the official list", async () => {
        await render("@founder:example.org");
        const coin = host.querySelector('[data-badge="founder"]');
        expect(coin?.getAttribute("title")).toBe("Founder: A founding member of Meadhall");
        expect(coin?.querySelectorAll("rect").length).toBeGreaterThan(50);
        expect(host.querySelector('[data-testid="unofficial-badges"]')).toBeNull();
    });

    it("puts other claims behind ... (but not a claim matching their real badge)", async () => {
        await render("@founder2:example.org", { "@founder2:example.org": ["Founder", "Gold"] });
        expect(host.querySelector('[data-testid="unofficial-badges"]')?.getAttribute("title")).toBe("Unofficial badges, not from Meadhall: Gold");
    });

    it("shows nothing for people without badges", async () => {
        await render("@nobody:example.org");
        expect(host.innerHTML).toBe("");
    });
});
