// SPDX-License-Identifier: AGPL-3.0-only
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fingerprint, parseClaimedBadges, verifyBadgeList } from "../../../src/core/badges/badges";

const published = JSON.parse(
    fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../badges/badges.json"), "utf8"),
) as { payload: string; signature: string };

function sign(payload: string, privateKey: crypto.KeyObject): string {
    return crypto.sign("sha256", Buffer.from(payload), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64");
}

describe("official badges", () => {
    it("the published list is signed by the owner's key and holds fingerprints, not user IDs", async () => {
        const list = await verifyBadgeList(published);
        expect(list).not.toBeNull();
        expect(published.payload).not.toContain("@");
        expect(list!.entries[await fingerprint("@someone:example.org", list!)]).toBeUndefined();
        // On the owner's machine (only), check every badge holder in the private list matches. Their IDs are never
        // written into the repository.
        const holdersFile = path.join(process.env.MEADHALL_BADGE_DIR ?? path.join(os.homedir(), "Documents", "Meadhall-badge-signing"), "badge-holders.json");
        if (fs.existsSync(holdersFile)) {
            const holders = JSON.parse(fs.readFileSync(holdersFile, "utf8")) as Record<string, string[]>;
            for (const [userId, badges] of Object.entries(holders)) expect(list!.entries[await fingerprint(userId, list!)]).toEqual(badges);
            expect(Object.keys(list!.entries)).toHaveLength(Object.keys(holders).length);
        }
    });

    it("rejects a list that was changed after signing", async () => {
        const payload = JSON.parse(published.payload) as { entries: Record<string, string[]> };
        payload.entries["forged-fingerprint"] = ["founder"];
        expect(await verifyBadgeList({ payload: JSON.stringify(payload), signature: published.signature })).toBeNull();
    });

    it("rejects a list signed by anyone else (e.g. a fork's own key)", async () => {
        const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
        const payload = JSON.stringify({ version: 1, issued: "", salt: "AAAA", iterations: 1000, entries: { x: ["founder"] } });
        expect(await verifyBadgeList({ payload, signature: sign(payload, privateKey) })).toBeNull();
        // The same list does verify against the key that signed it.
        const forkKey = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64");
        expect(await verifyBadgeList({ payload, signature: sign(payload, privateKey) }, forkKey)).not.toBeNull();
    });

    it("ignores unknown badges and junk", async () => {
        expect(await verifyBadgeList(null)).toBeNull();
        expect(await verifyBadgeList({ payload: 1, signature: "x" })).toBeNull();
        expect(parseClaimedBadges(["Founder", { label: "Gold" }, 7, ""])).toEqual(["Founder", "Gold"]);
    });
});
